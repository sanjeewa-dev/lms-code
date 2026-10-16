import { z } from 'zod';
import { basePrisma, prisma } from '../lib/prisma';
import { storage } from './storage';
import { callAnthropicForExtraction, parseJsonObject } from './anthropic';
import { convertPaperUploadToPages } from '../lib/paperDocumentConvert';
import { figureIndicesPerQuestionBlock } from '../lib/docxFigureMap';
import { cropPageFigure } from '../lib/pageFigureCrop';
import { persistQuestionFigureBuffer } from './questionFigures';
import { figureImageCreate } from '../lib/questionFigureUrl';
import { runWithContext } from '../lib/tenantContext';
import { badRequest, notFound } from '../utils/httpError';

const SYSTEM_JSON =
  'You extract exam questions into structured JSON. Reply with a single JSON object only — no markdown fences, no commentary.';

const draftQuestionSchema = z.object({
  questionNumber: z.number().int().positive().optional(),
  type: z.enum(['mcq', 'structured']).default('mcq'),
  stem: z.string().min(1),
  options: z.array(z.string()).optional(),
  correctAnswer: z.union([z.number(), z.string(), z.null()]).optional(),
  topic: z.string().optional(),
  confidence: z.number().optional(),
  hasFigure: z.boolean().optional(),
  figureBox: z
    .object({
      x: z.number(),
      y: z.number(),
      w: z.number(),
      h: z.number(),
    })
    .nullable()
    .optional(),
});

const extractionSchema = z.object({
  questions: z.array(draftQuestionSchema).min(1),
  confidence: z.number().optional(),
});

export type PaperDraftItem = {
  questionNumber: number;
  text: string;
  options: string[];
  /** 0-based index, or null if teacher must pick */
  correctIndex: number | null;
  topic: string;
  complexity: string;
  marks: number;
  imageUrls?: string[];
  hasFigure?: boolean;
  figureBox?: { x: number; y: number; w: number; h: number } | null;
};

type PaperSidecar = {
  pageKeys: string[];
  textContent?: string;
  htmlContent?: string;
  embeddedImageKeys?: string[];
  sourceKind: 'image' | 'pdf' | 'docx';
};

function normalizeOptions(raw: string[] | undefined): string[] {
  const opts = (raw ?? []).map((o) => o.replace(/^\s*[A-Ea-e][).:\-]\s*/, '').trim()).filter(Boolean);
  if (opts.length >= 2) {
    while (opts.length < 4) opts.push('');
    return opts.slice(0, 5);
  }
  return ['', '', '', ''];
}

function normalizeCorrectIndex(
  type: 'mcq' | 'structured',
  correctAnswer: number | string | null | undefined,
  optionCount: number
): number | null {
  if (type !== 'mcq' || correctAnswer == null) return null;
  if (typeof correctAnswer === 'number') {
    // Accept 1-based (ScoreSmart) or 0-based
    if (correctAnswer >= 1 && correctAnswer <= optionCount) return correctAnswer - 1;
    if (correctAnswer >= 0 && correctAnswer < optionCount) return correctAnswer;
    return null;
  }
  const raw = String(correctAnswer).trim();
  const letter = raw.toUpperCase().match(/\b([A-E])\b/)?.[1];
  if (letter) {
    const idx = letter.charCodeAt(0) - 65;
    return idx < optionCount ? idx : null;
  }
  const asNum = Number(raw.replace(/[^\d.-]/g, ''));
  if (!Number.isNaN(asNum)) {
    if (asNum >= 1 && asNum <= optionCount) return asNum - 1;
    if (asNum >= 0 && asNum < optionCount) return asNum;
  }
  return null;
}

function mapExtractedQuestions(
  questions: z.infer<typeof draftQuestionSchema>[],
  startNumber = 1
): PaperDraftItem[] {
  return questions.map((q, i) => {
    const type = q.type ?? 'mcq';
    const options = type === 'mcq' ? normalizeOptions(q.options) : ['', '', '', ''];
    const filled = options.filter((o) => o.trim()).length;
    return {
      questionNumber: q.questionNumber ?? startNumber + i,
      text: q.stem.trim(),
      options,
      correctIndex: normalizeCorrectIndex(type, q.correctAnswer ?? null, filled || options.length),
      topic: (q.topic || 'General').trim() || 'General',
      complexity: 'not_defined',
      marks: 1,
      hasFigure: q.hasFigure,
      figureBox: q.figureBox ?? null,
    };
  });
}

const ANSWER_RULES =
  'Rules:\n' +
  '- Include ALL questions.\n' +
  '- Prefer type "mcq" when options are present. For MCQ always extract every option text.\n' +
  '- ALWAYS try to set correctAnswer for MCQ (1-based index: 1=first option, 2=second, …).\n' +
  '- Look carefully for the correct answer: answer key, tick/check mark, asterisk (*), bold/underline, ' +
  'circled letter, highlighted choice, "Ans:", "Answer:", or a separate answers section.\n' +
  '- If the paper is clearly an answer-marked sheet or past paper with answers, fill correctAnswer for every MCQ.\n' +
  '- Only leave correctAnswer null when there is genuinely no indication of the answer.\n' +
  '- Invent a short topic only if none is labeled.\n' +
  '- Set hasFigure true when the question includes a diagram, graph, map, circuit, table-as-image, or photo.\n' +
  '- When hasFigure is true, set figureBox to the region of THIS page as fractions 0–1: {x, y, w, h} from the top-left.\n' +
  '- If you cannot locate a tight box, set hasFigure true and figureBox null.';

async function extractFromImage(buffer: Buffer): Promise<PaperDraftItem[]> {
  const prompt =
    'Extract every question from this exam/question paper image for a question bank.\n' +
    'Return ONE JSON object only:\n' +
    '{\n' +
    '  "questions": [\n' +
    '    {\n' +
    '      "questionNumber": 1,\n' +
    '      "type": "mcq" | "structured",\n' +
    '      "stem": "full question text",\n' +
    '      "options": ["option 1", "option 2", "option 3", "option 4"],\n' +
    '      "correctAnswer": 1-based option index (1-4) or letter A-D, or null only if unknown,\n' +
    '      "topic": "short topic label",\n' +
    '      "hasFigure": true if this question has a diagram/graph/figure, else false,\n' +
    '      "figureBox": { "x": 0-1, "y": 0-1, "w": 0-1, "h": 0-1 } or null\n' +
    '    }\n' +
    '  ]\n' +
    '}\n' +
    ANSWER_RULES;

  const raw = await callAnthropicForExtraction({
    system: SYSTEM_JSON,
    prompt,
    image: { base64: buffer.toString('base64'), mediaType: 'image/jpeg' },
    maxTokens: 8192,
  });
  const parsed = parseJsonObject<Record<string, unknown>>(raw);
  const result = extractionSchema.safeParse(parsed);
  if (!result.success) throw new Error('Could not parse question extraction from image');
  return mapExtractedQuestions(result.data.questions);
}

async function extractFromText(text: string): Promise<PaperDraftItem[]> {
  const clipped = text.length > 60_000 ? `${text.slice(0, 60_000)}\n\n[truncated]` : text;
  const prompt =
    'Extract every exam question from the following document text for a question bank.\n' +
    'Return ONE JSON object only:\n' +
    '{\n' +
    '  "questions": [\n' +
    '    {\n' +
    '      "questionNumber": 1,\n' +
    '      "type": "mcq" | "structured",\n' +
    '      "stem": "full question text",\n' +
    '      "options": ["option 1", "option 2", "option 3", "option 4"],\n' +
    '      "correctAnswer": 1-based option index (1-4) or letter A-D, or null only if unknown,\n' +
    '      "topic": "short topic label"\n' +
    '    }\n' +
    '  ]\n' +
    '}\n' +
    ANSWER_RULES +
    '\n\nDOCUMENT TEXT:\n' +
    clipped;

  const raw = await callAnthropicForExtraction({
    system: SYSTEM_JSON,
    prompt,
    maxTokens: 8192,
  });
  const parsed = parseJsonObject<Record<string, unknown>>(raw);
  const result = extractionSchema.safeParse(parsed);
  if (!result.success) throw new Error('Could not parse question extraction from text');
  return mapExtractedQuestions(result.data.questions);
}

export async function createPaperAndExtract(params: {
  tenantId: string;
  bankId: string;
  uploaderId: string;
  file: Express.Multer.File;
}) {
  const buffer = params.file.buffer;
  if (!buffer?.length) throw badRequest('Uploaded file could not be read');

  let converted;
  try {
    converted = await convertPaperUploadToPages({
      fileBuffer: buffer,
      originalname: params.file.originalname,
      mimetype: params.file.mimetype,
    });
  } catch (err) {
    throw badRequest(err instanceof Error ? err.message : 'Could not process document');
  }

  const pageKeys: string[] = [];
  for (let i = 0; i < converted.pages.length; i++) {
    const key = await storage.save(converted.pages[i]!.buffer, `paper-p${i + 1}.jpg`);
    pageKeys.push(key);
  }
  const embeddedImageKeys: string[] = [];
  if (converted.embeddedImages?.length) {
    for (let i = 0; i < converted.embeddedImages.length; i++) {
      const key = await storage.save(converted.embeddedImages[i]!, `paper-fig-${i + 1}.jpg`);
      embeddedImageKeys.push(key);
    }
  }

  const sidecar: PaperSidecar = {
    pageKeys,
    textContent: converted.textContent,
    htmlContent: converted.htmlContent,
    embeddedImageKeys: embeddedImageKeys.length ? embeddedImageKeys : undefined,
    sourceKind: converted.kind,
  };

  const paper = await prisma.questionBankPaper.create({
    data: {
      tenantId: params.tenantId,
      bankId: params.bankId,
      uploaderId: params.uploaderId,
      imageKey: pageKeys[0]!,
      sourceKind: converted.kind,
      pageCount: pageKeys.length,
      sidecar: sidecar as object,
      extractionStatus: 'pending',
    },
  });

  // Run extraction inline (async fire-and-forget from caller perspective is fine;
  // we await here so status updates before returning when fast; for long PDFs caller already returned).
  void processPaperExtraction(paper.id).catch((err) => {
    console.error('[question-bank] paper extraction failed', paper.id, err);
  });

  return {
    id: paper.id,
    bankId: paper.bankId,
    extractionStatus: paper.extractionStatus,
    sourceKind: converted.kind,
    pageCount: pageKeys.length,
  };
}

export async function processPaperExtraction(paperId: string) {
  const paper = await prisma.questionBankPaper.findFirst({ where: { id: paperId } });
  if (!paper) return;

  await runWithContext({ tenantId: paper.tenantId }, async () => {
    await processPaperExtractionInTenant(paper);
  });
}

function stripFigureMeta(item: PaperDraftItem): PaperDraftItem {
  const { hasFigure: _h, figureBox: _b, ...rest } = item;
  return rest;
}

async function attachDocxFigures(params: {
  drafts: PaperDraftItem[];
  sidecar: PaperSidecar;
  tenantId: string;
  ownerId: string;
  slug: string;
}): Promise<PaperDraftItem[]> {
  const keys = params.sidecar.embeddedImageKeys ?? [];
  if (!keys.length) return params.drafts.map(stripFigureMeta);

  const html = params.sidecar.htmlContent ?? '';
  let blocks = html ? figureIndicesPerQuestionBlock(html) : keys.map((_, i) => [i]);
  if (html && blocks.length === 0 && keys.length) {
    blocks = keys.map((_, i) => [i]);
  }

  const result: PaperDraftItem[] = [];
  for (let i = 0; i < params.drafts.length; i++) {
    const draft = params.drafts[i]!;
    const indices = (blocks[i] ?? []).filter((idx) => idx >= 0 && idx < keys.length);
    const imageUrls: string[] = [];
    for (const idx of indices.slice(0, 5)) {
      try {
        const buf = await storage.read(keys[idx]!);
        const saved = await persistQuestionFigureBuffer({
          tenantId: params.tenantId,
          ownerId: params.ownerId,
          slug: params.slug,
          buffer: buf,
          originalName: `paper-fig-${idx + 1}.jpg`,
        });
        imageUrls.push(saved.imageUrl);
      } catch {
        // skip unreadable media
      }
    }
    result.push(stripFigureMeta({ ...draft, imageUrls: imageUrls.length ? imageUrls : undefined }));
  }
  return result;
}

async function attachPdfFigures(params: {
  drafts: PaperDraftItem[];
  pageBuffer: Buffer;
  tenantId: string;
  ownerId: string;
  slug: string;
}): Promise<PaperDraftItem[]> {
  const result: PaperDraftItem[] = [];
  for (const draft of params.drafts) {
    if (!draft.hasFigure) {
      result.push(stripFigureMeta(draft));
      continue;
    }
    try {
      const crop = await cropPageFigure(params.pageBuffer, draft.figureBox);
      const saved = await persistQuestionFigureBuffer({
        tenantId: params.tenantId,
        ownerId: params.ownerId,
        slug: params.slug,
        buffer: crop,
        originalName: `q${draft.questionNumber}-figure.jpg`,
      });
      result.push(stripFigureMeta({ ...draft, imageUrls: [saved.imageUrl] }));
    } catch {
      result.push(stripFigureMeta(draft));
    }
  }
  return result;
}

async function processPaperExtractionInTenant(
  paper: {
    id: string;
    tenantId: string;
    uploaderId: string;
    imageKey: string;
    sidecar: unknown;
  },
) {
  await prisma.questionBankPaper.update({
    where: { id: paper.id },
    data: { extractionStatus: 'processing', errorMessage: null },
  });

  try {
    const sidecar = (paper.sidecar ?? {}) as PaperSidecar;
    const tenant = await basePrisma.tenant.findUnique({
      where: { id: paper.tenantId },
      select: { slug: true },
    });
    const slug = tenant?.slug ?? 'unknown';
    let drafts: PaperDraftItem[] = [];

    if (sidecar.sourceKind === 'docx' && sidecar.textContent?.trim()) {
      drafts = await extractFromText(sidecar.textContent);
      drafts = await attachDocxFigures({
        drafts,
        sidecar,
        tenantId: paper.tenantId,
        ownerId: paper.uploaderId,
        slug,
      });
    } else {
      const pageKeys = sidecar.pageKeys?.length ? sidecar.pageKeys : [paper.imageKey];
      let nextNum = 1;
      for (const key of pageKeys) {
        const buf = await storage.read(key);
        const pageDrafts = await extractFromImage(buf);
        const renumbered = pageDrafts.map((d, i) => ({
          ...d,
          questionNumber: nextNum + i,
        }));
        nextNum += renumbered.length;
        const withFigures = await attachPdfFigures({
          drafts: renumbered,
          pageBuffer: buf,
          tenantId: paper.tenantId,
          ownerId: paper.uploaderId,
          slug,
        });
        drafts.push(...withFigures);
      }
    }

    if (!drafts.length) throw new Error('No questions found in the document');

    await prisma.questionBankPaper.update({
      where: { id: paper.id },
      data: {
        extractionStatus: 'pending_review',
        draftItems: drafts as object[],
        errorMessage: null,
      },
    });
  } catch (err) {
    await prisma.questionBankPaper.update({
      where: { id: paper.id },
      data: {
        extractionStatus: 'failed',
        errorMessage: err instanceof Error ? err.message : 'Extraction failed',
      },
    });
  }
}

export async function getPaper(paperId: string) {
  const paper = await prisma.questionBankPaper.findFirst({ where: { id: paperId } });
  if (!paper) throw notFound('Paper not found');
  return {
    id: paper.id,
    bankId: paper.bankId,
    extractionStatus: paper.extractionStatus,
    draftItems: (paper.draftItems as PaperDraftItem[] | null) ?? [],
    errorMessage: paper.errorMessage,
    sourceKind: paper.sourceKind,
    pageCount: paper.pageCount,
    createdAt: paper.createdAt,
    updatedAt: paper.updatedAt,
  };
}

export async function confirmPaper(params: {
  paperId: string;
  tenantId: string;
  items: Array<{
    text: string;
    options: string[];
    correctIndex: number;
    topic?: string;
    complexity?: string;
    marks?: number;
    imageUrls?: string[];
  }>;
}) {
  const paper = await prisma.questionBankPaper.findFirst({ where: { id: params.paperId } });
  if (!paper) throw notFound('Paper not found');
  if (paper.extractionStatus !== 'pending_review' && paper.extractionStatus !== 'completed') {
    throw badRequest('Paper is not ready to confirm yet');
  }
  if (!params.items.length) throw badRequest('No questions to save');

  let saved = 0;
  for (const item of params.items) {
    const options = item.options.map(String);
    if (options.filter((o) => o.trim()).length < 2) {
      throw badRequest(`Question needs at least 2 options: ${item.text.slice(0, 40)}`);
    }
    if (item.correctIndex < 0 || item.correctIndex >= options.length) {
      throw badRequest(`Pick a correct answer for: ${item.text.slice(0, 40)}`);
    }
    await prisma.questionBankItem.create({
      data: {
        tenantId: params.tenantId,
        bankId: paper.bankId,
        text: item.text.trim(),
        options,
        correctIndex: item.correctIndex,
        topic: (item.topic || 'General').trim() || 'General',
        complexity: item.complexity || 'not_defined',
        marks: item.marks ?? 1,
        images: item.imageUrls?.length
          ? {
              create: item.imageUrls.map((imageUrl, i) =>
                figureImageCreate(params.tenantId, imageUrl, i),
              ),
            }
          : undefined,
      },
    });
    saved += 1;
  }

  await prisma.questionBankPaper.update({
    where: { id: paper.id },
    data: { extractionStatus: 'completed', draftItems: params.items as object[] },
  });

  return { saved, bankId: paper.bankId };
}

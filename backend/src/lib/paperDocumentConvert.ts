import path from 'path';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import sharp from 'sharp';

const MAX_PDF_PAGES = 12;
const MAX_DOCX_IMAGES = 20;
const PDF_RENDER_SCALE = 3;
const PDF_MAX_WIDTH = 2500;
const IMAGE_MAX_WIDTH = 2000;

export type ConvertedPaperPage = {
  buffer: Buffer;
  mediaType: 'image/jpeg';
};

export type ConvertedDocument = {
  kind: 'image' | 'pdf' | 'docx';
  pages: ConvertedPaperPage[];
  textContent?: string;
  embeddedImages?: Buffer[];
};

function extOf(filename: string): string {
  return path.extname(filename || '').toLowerCase();
}

export function detectPaperUploadKind(
  filename: string,
  mimeType?: string
): 'image' | 'pdf' | 'docx' | 'unsupported' {
  const ext = extOf(filename);
  const mime = (mimeType || '').toLowerCase();
  if (
    ext === '.jpg' ||
    ext === '.jpeg' ||
    ext === '.png' ||
    mime === 'image/jpeg' ||
    mime === 'image/jpg' ||
    mime === 'image/png'
  ) {
    return 'image';
  }
  if (ext === '.pdf' || mime === 'application/pdf') return 'pdf';
  if (
    ext === '.docx' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'docx';
  }
  return 'unsupported';
}

async function normalizeScanOrPhoto(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({ width: IMAGE_MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function normalizePdfPageImage(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .ensureAlpha()
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize({ width: PDF_MAX_WIDTH, withoutEnlargement: true })
    .sharpen({ sigma: 0.5 })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

async function pdfToPageImages(fileBuffer: Buffer): Promise<ConvertedPaperPage[]> {
  const { pdf } = await import('pdf-to-img');
  const document = await pdf(fileBuffer, { scale: PDF_RENDER_SCALE });
  const pages: ConvertedPaperPage[] = [];
  let index = 0;
  for await (const png of document) {
    index += 1;
    if (index > MAX_PDF_PAGES) break;
    const jpeg = await normalizePdfPageImage(Buffer.from(png));
    pages.push({ buffer: jpeg, mediaType: 'image/jpeg' });
  }
  // pdf-to-img v4+ has no destroy(); older forks sometimes did.
  const maybeDestroy = (document as { destroy?: () => Promise<void> | void }).destroy;
  if (typeof maybeDestroy === 'function') {
    try {
      await Promise.resolve(maybeDestroy.call(document));
    } catch {
      // ignore cleanup errors
    }
  }
  if (pages.length === 0) throw new Error('PDF has no readable pages');
  return pages;
}

async function extractDocxEmbeddedImages(fileBuffer: Buffer): Promise<Buffer[]> {
  const zip = await JSZip.loadAsync(fileBuffer);
  const out: Buffer[] = [];
  const media = Object.keys(zip.files)
    .filter((name) => /^word\/media\//i.test(name) && !zip.files[name]!.dir)
    .sort();
  for (const name of media) {
    if (out.length >= MAX_DOCX_IMAGES) break;
    const entry = zip.files[name];
    if (!entry) continue;
    const raw = await entry.async('nodebuffer');
    try {
      out.push(await normalizeScanOrPhoto(raw));
    } catch {
      // skip non-image media
    }
  }
  return out;
}

async function docxToConvertible(fileBuffer: Buffer): Promise<ConvertedDocument> {
  const [textResult, embeddedImages] = await Promise.all([
    mammoth.extractRawText({ buffer: fileBuffer }),
    extractDocxEmbeddedImages(fileBuffer),
  ]);
  const textContent = (textResult.value || '').trim();
  if (!textContent && embeddedImages.length === 0) {
    throw new Error('Word document appears empty');
  }

  let pages: ConvertedPaperPage[] = [];
  if (embeddedImages.length > 0) {
    pages = embeddedImages.slice(0, 1).map((buffer) => ({ buffer, mediaType: 'image/jpeg' as const }));
  } else {
    const preview = await sharp({
      create: {
        width: 1200,
        height: 1600,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .jpeg({ quality: 80 })
      .toBuffer();
    pages = [{ buffer: preview, mediaType: 'image/jpeg' }];
  }

  return {
    kind: 'docx',
    pages,
    textContent: textContent || undefined,
    embeddedImages: embeddedImages.length > 0 ? embeddedImages : undefined,
  };
}

export async function convertPaperUploadToPages(params: {
  fileBuffer: Buffer;
  originalname: string;
  mimetype?: string;
}): Promise<ConvertedDocument> {
  const kind = detectPaperUploadKind(params.originalname, params.mimetype);
  if (kind === 'unsupported') {
    throw new Error('Unsupported file type. Upload JPEG, PNG, PDF, or Word (.docx).');
  }
  if (kind === 'image') {
    const buffer = await normalizeScanOrPhoto(params.fileBuffer);
    return { kind: 'image', pages: [{ buffer, mediaType: 'image/jpeg' }] };
  }
  if (kind === 'pdf') {
    const pages = await pdfToPageImages(params.fileBuffer);
    return { kind: 'pdf', pages };
  }
  return docxToConvertible(params.fileBuffer);
}

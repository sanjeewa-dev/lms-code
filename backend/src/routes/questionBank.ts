import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole } from '../middleware/auth';
import { enterTenantContext } from '../middleware/tenant';
import { uploadQuestionBankFile, uploadQuestionBankPaper } from '../middleware/upload';
import {
  importBankItemsSchema,
  questionBankBulkItemsSchema,
  questionBankCreateSchema,
  questionBankItemSchema,
  questionBankConfirmPaperSchema,
  saveQuestionsToBankSchema,
} from '../validation/schemas';
import { buildTopicMapping } from '../services/topicMapping';
import {
  ensureQuestionBank,
  normalizeGrade,
  normalizeSubject,
} from '../services/questionBank';
import { persistUploadedFile } from '../services/files';
import {
  confirmPaper,
  createPaperAndExtract,
  getPaper,
} from '../services/paperExtraction';
import { storage } from '../services/storage';
import { badRequest, forbidden, notFound } from '../utils/httpError';

const router = Router({ mergeParams: true });

async function assertBankAccess(req: any, bankId: string) {
  const bank = await prisma.questionBank.findFirst({ where: { id: bankId } });
  if (!bank) throw notFound('Question bank not found');
  if (req.user.role === 'teacher' && bank.ownerId !== req.user.sub) {
    throw forbidden('Not your question bank');
  }
  return bank;
}

/** Teacher subjects (from classes) + grades (from batches) + existing banks. */
router.get(
  '/question-bank/meta',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.sub;
    const ownerId =
      req.user!.role === 'admin' && typeof req.query.teacherId === 'string'
        ? req.query.teacherId
        : userId;

    const owner = await prisma.user.findFirst({
      where: { id: ownerId },
      select: { id: true, name: true, subject: true },
    });
    if (!owner) throw notFound('Teacher not found');

    const classes = await prisma.class.findMany({
      where: { teacherId: ownerId },
      select: {
        subject: true,
        batch: { select: { name: true, year: true } },
      },
    });
    const subjects = [
      ...new Set(
        [
          ...classes.map((c) => c.subject?.trim()).filter(Boolean),
          owner.subject?.trim(),
        ].filter((s): s is string => Boolean(s))
      ),
    ].sort();
    const grades = [
      ...new Set(
        classes
          .map((c) => c.batch?.name?.trim())
          .filter((n): n is string => Boolean(n))
      ),
    ].sort();

    const banks = await prisma.questionBank.findMany({
      where: { ownerId },
      include: { _count: { select: { items: true } } },
      orderBy: [{ subject: 'asc' }, { grade: 'asc' }],
    });

    res.json({
      teacher: { id: owner.id, name: owner.name, subject: owner.subject ?? '' },
      defaultSubject: normalizeSubject(subjects[0] || owner.subject),
      subjects,
      grades,
      banks: banks.map((b) => ({
        id: b.id,
        title: b.title,
        subject: b.subject,
        grade: b.grade,
        itemCount: b._count.items,
      })),
    });
  })
);

router.post(
  '/question-bank',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const data = questionBankCreateSchema.parse(req.body);
    const bank = await ensureQuestionBank({
      tenantId: req.tenant!.id,
      ownerId: req.user!.sub,
      subject: data.subject,
      grade: data.grade,
      title: data.title,
    });
    res.status(201).json({ bank });
  })
);

router.get(
  '/question-bank',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const bankId = typeof req.query.bankId === 'string' ? req.query.bankId : undefined;
    const subject =
      typeof req.query.subject === 'string' ? normalizeSubject(req.query.subject) : undefined;
    const grade =
      typeof req.query.grade === 'string' ? normalizeGrade(req.query.grade) : undefined;
    const topic = typeof req.query.topic === 'string' ? req.query.topic : undefined;
    const complexity =
      typeof req.query.complexity === 'string' ? req.query.complexity : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    let bank;
    if (bankId) {
      bank = await assertBankAccess(req, bankId);
    } else if (subject) {
      bank = await ensureQuestionBank({
        tenantId: req.tenant!.id,
        ownerId: req.user!.sub,
        subject,
        grade: grade ?? '',
      });
    } else {
      const banks = await prisma.questionBank.findMany({
        where: { ownerId: req.user!.sub },
        include: { _count: { select: { items: true } } },
        orderBy: [{ subject: 'asc' }, { grade: 'asc' }],
      });
      return res.json({ banks, items: [] });
    }

    const items = await prisma.questionBankItem.findMany({
      where: {
        bankId: bank.id,
        ...(topic ? { topic } : {}),
        ...(complexity ? { complexity } : {}),
        ...(q ? { text: { contains: q, mode: 'insensitive' } } : {}),
      },
      include: { images: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ bank, items });
  })
);

/**
 * Banks for quiz authoring on a class:
 * teacher + class.subject + batch grade (when present).
 */
router.get(
  '/classes/:classId/question-banks',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const klass = await prisma.class.findFirst({
      where: { id: req.params.classId },
      include: {
        teacher: { select: { id: true, name: true, subject: true } },
        batch: { select: { name: true, year: true } },
      },
    });
    if (!klass) throw notFound('Class not found');
    if (req.user!.role === 'teacher' && klass.teacherId !== req.user!.sub) {
      throw forbidden('You can only use banks for your own classes');
    }

    const subject = normalizeSubject(klass.subject || klass.teacher.subject);
    const grade = normalizeGrade(klass.batch?.name);
    const ownerId = klass.teacherId;

    await ensureQuestionBank({
      tenantId: req.tenant!.id,
      ownerId,
      subject,
      grade,
    });

    const banks = await prisma.questionBank.findMany({
      where: {
        ownerId,
        subject,
        OR: grade ? [{ grade }, { grade: '' }] : [{ grade: '' }],
      },
      include: { _count: { select: { items: true } } },
      orderBy: [{ grade: 'desc' }, { title: 'asc' }],
    });

    res.json({
      context: {
        classId: klass.id,
        teacherId: ownerId,
        teacherName: klass.teacher.name,
        subject,
        grade: grade || null,
        batchName: klass.batch?.name ?? null,
      },
      banks: banks.map((b) => ({
        id: b.id,
        title: b.title,
        subject: b.subject,
        grade: b.grade,
        itemCount: b._count.items,
      })),
    });
  })
);

router.post(
  '/question-bank/items',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const data = questionBankItemSchema.parse(req.body);
    const tenantId = req.tenant!.id;
    const bank = await assertBankAccess(req, data.bankId);
    const item = await prisma.questionBankItem.create({
      data: {
        tenantId,
        bankId: bank.id,
        text: data.text,
        options: data.options,
        correctIndex: data.correctIndex,
        marks: data.marks,
        topic: data.topic,
        complexity: data.complexity,
        images: data.imageUrls?.length
          ? {
              create: data.imageUrls.map((imageUrl, i) => ({
                tenantId,
                imageUrl,
                sortOrder: i,
              })),
            }
          : undefined,
      },
      include: { images: true },
    });
    res.status(201).json({ item, bank });
  })
);

router.post(
  '/question-bank/items/bulk',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const data = questionBankBulkItemsSchema.parse(req.body);
    const tenantId = req.tenant!.id;
    const bank = await assertBankAccess(req, data.bankId);
    let created = 0;
    for (const row of data.items) {
      await prisma.questionBankItem.create({
        data: {
          tenantId,
          bankId: bank.id,
          text: row.text,
          options: row.options,
          correctIndex: row.correctIndex,
          marks: row.marks,
          topic: row.topic,
          complexity: row.complexity,
        },
      });
      created += 1;
    }
    res.status(201).json({ created, bankId: bank.id });
  })
);

router.patch(
  '/question-bank/items/:itemId',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.questionBankItem.findFirst({
      where: { id: req.params.itemId },
      include: { bank: true },
    });
    if (!existing) throw notFound('Item not found');
    if (existing.bank.ownerId !== req.user!.sub && req.user!.role === 'teacher') {
      throw forbidden('Not your bank item');
    }
    const data = questionBankItemSchema.parse(req.body);
    const tenantId = req.tenant!.id;
    await prisma.questionBankItemImage.deleteMany({ where: { itemId: existing.id } });
    const item = await prisma.questionBankItem.update({
      where: { id: existing.id },
      data: {
        text: data.text,
        options: data.options,
        correctIndex: data.correctIndex,
        marks: data.marks,
        topic: data.topic,
        complexity: data.complexity,
        images: data.imageUrls?.length
          ? {
              create: data.imageUrls.map((imageUrl, i) => ({
                tenantId,
                imageUrl,
                sortOrder: i,
              })),
            }
          : undefined,
      },
      include: { images: true },
    });
    res.json({ item });
  })
);

router.delete(
  '/question-bank/items/:itemId',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.questionBankItem.findFirst({
      where: { id: req.params.itemId },
      include: { bank: true },
    });
    if (!existing) throw notFound('Item not found');
    if (existing.bank.ownerId !== req.user!.sub && req.user!.role === 'teacher') {
      throw forbidden('Not your bank item');
    }
    await prisma.questionBankItem.delete({ where: { id: existing.id } });
    res.status(204).send();
  })
);

router.post(
  '/quizzes/:quizId/import-bank-items',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const quiz = await prisma.quiz.findFirst({
      where: { id: req.params.quizId },
      include: {
        class: {
          select: {
            teacherId: true,
            subject: true,
            teacher: { select: { subject: true } },
            batch: { select: { name: true } },
          },
        },
        questions: true,
        _count: { select: { attempts: true } },
      },
    });
    if (!quiz) throw notFound('Quiz not found');
    if (req.user!.role === 'teacher' && quiz.class.teacherId !== req.user!.sub) {
      throw forbidden('Not allowed');
    }
    if (quiz._count.attempts > 0) {
      throw badRequest('Cannot add questions after students have started this quiz');
    }

    const { itemIds } = importBankItemsSchema.parse(req.body);
    const items = await prisma.questionBankItem.findMany({
      where: { id: { in: itemIds } },
      include: { images: { orderBy: { sortOrder: 'asc' } }, bank: true },
    });
    if (items.length === 0) throw badRequest('No bank items found');

    const subject = normalizeSubject(quiz.class.subject || quiz.class.teacher.subject);
    const grade = normalizeGrade(quiz.class.batch?.name);
    const tenantId = req.tenant!.id;
    let order = quiz.questions.length;
    const created = [];
    for (const item of items) {
      if (item.bank.ownerId !== quiz.class.teacherId) continue;
      if (normalizeSubject(item.bank.subject) !== subject) continue;
      if (item.bank.grade && grade && item.bank.grade !== grade) continue;
      if (item.bank.grade && !grade) continue;

      const q = await prisma.question.create({
        data: {
          tenantId,
          quizId: quiz.id,
          text: item.text,
          options: item.options as string[],
          correctIndex: item.correctIndex,
          marks: item.marks,
          order: order++,
          topic: item.topic,
          complexity: item.complexity,
          sourceBankItemId: item.id,
          images: item.images.length
            ? {
                create: item.images.map((img, i) => ({
                  tenantId,
                  imageUrl: img.imageUrl,
                  fileId: img.fileId,
                  sortOrder: i,
                })),
              }
            : undefined,
        },
        include: { images: true },
      });
      created.push(q);
    }

    const allQuestions = await prisma.question.findMany({
      where: { quizId: quiz.id },
      orderBy: { order: 'asc' },
    });
    const totalMarks = allQuestions.reduce((s, q) => s + q.marks, 0);
    const topicMapping = buildTopicMapping(allQuestions);
    await prisma.quiz.update({
      where: { id: quiz.id },
      data: { totalMarks, topicMapping },
    });

    res.status(201).json({ imported: created.length, questions: created });
  })
);

router.post(
  '/quizzes/:quizId/save-to-bank',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const quiz = await prisma.quiz.findFirst({
      where: { id: req.params.quizId },
      include: {
        class: {
          select: {
            teacherId: true,
            subject: true,
            teacher: { select: { subject: true } },
            batch: { select: { name: true } },
          },
        },
        questions: { include: { images: true }, orderBy: { order: 'asc' } },
      },
    });
    if (!quiz) throw notFound('Quiz not found');
    if (req.user!.role === 'teacher' && quiz.class.teacherId !== req.user!.sub) {
      throw forbidden('Not allowed');
    }

    const body = saveQuestionsToBankSchema.parse(req.body ?? {});
    const selected = body.questionIds?.length
      ? quiz.questions.filter((q) => body.questionIds!.includes(q.id))
      : quiz.questions;

    const tenantId = req.tenant!.id;
    let bank;
    if (body.bankId) {
      bank = await assertBankAccess(req, body.bankId);
      if (bank.ownerId !== quiz.class.teacherId) {
        throw forbidden('Bank must belong to the class teacher');
      }
    } else {
      bank = await ensureQuestionBank({
        tenantId,
        ownerId: quiz.class.teacherId,
        subject: body.subject || quiz.class.subject || quiz.class.teacher.subject || 'General',
        grade: body.grade ?? quiz.class.batch?.name ?? '',
      });
    }

    let saved = 0;
    for (const q of selected) {
      await prisma.questionBankItem.create({
        data: {
          tenantId,
          bankId: bank.id,
          text: q.text,
          options: q.options as string[],
          correctIndex: q.correctIndex,
          marks: q.marks,
          topic: q.topic,
          complexity: q.complexity,
          images: q.images.length
            ? {
                create: q.images.map((img, i) => ({
                  tenantId,
                  imageUrl: img.imageUrl,
                  fileId: img.fileId,
                  sortOrder: i,
                })),
              }
            : undefined,
        },
      });
      saved += 1;
    }
    res.status(201).json({ saved, bank });
  })
);

const ATTACHMENT_SELECT = {
  id: true,
  originalName: true,
  mimeType: true,
  fileId: true,
  createdAt: true,
  file: { select: { id: true, size: true, mimeType: true } },
} as const;

/** List uploaded source files for a bank (images / Word / PDF). */
router.get(
  '/question-bank/:bankId/attachments',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    await assertBankAccess(req, req.params.bankId);
    const attachments = await prisma.questionBankAttachment.findMany({
      where: { bankId: req.params.bankId },
      select: ATTACHMENT_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      attachments: attachments.map((a) => ({
        id: a.id,
        originalName: a.originalName,
        mimeType: a.mimeType,
        fileId: a.fileId,
        size: a.file.size,
        createdAt: a.createdAt,
      })),
    });
  })
);

/** Upload an image, Word, or PDF file into the bank (validated against malicious content). */
router.post(
  '/question-bank/:bankId/attachments',
  authenticate,
  requireRole('teacher', 'admin'),
  uploadQuestionBankFile,
  enterTenantContext,
  asyncHandler(async (req, res) => {
    const bank = await assertBankAccess(req, req.params.bankId);
    if (!req.file) throw badRequest('A file is required');

    const allowedExt = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf', '.doc', '.docx']);
    const ext = (req.file.originalname || '').toLowerCase().match(/\.[^.]+$/)?.[0] ?? '';
    if (!allowedExt.has(ext)) {
      throw badRequest('Only images (JPG, PNG, WebP, GIF), PDF, or Word (.doc, .docx) are allowed');
    }

    const file = await persistUploadedFile(req.file, req.user!.sub, 'question_bank');
    const attachment = await prisma.questionBankAttachment.create({
      data: {
        tenantId: req.tenant!.id,
        bankId: bank.id,
        fileId: file.id,
        originalName: file.originalName,
        mimeType: file.mimeType,
      },
      select: ATTACHMENT_SELECT,
    });

    res.status(201).json({
      attachment: {
        id: attachment.id,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        fileId: attachment.fileId,
        size: attachment.file.size,
        createdAt: attachment.createdAt,
      },
    });
  })
);

router.get(
  '/question-bank/attachments/:attachmentId/download',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const attachment = await prisma.questionBankAttachment.findFirst({
      where: { id: req.params.attachmentId },
      include: { file: true, bank: true },
    });
    if (!attachment) throw notFound('Attachment not found');
    await assertBankAccess(req, attachment.bankId);

    res.setHeader('Content-Type', attachment.file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(attachment.file.originalName)}"`
    );
    storage.createReadStream(attachment.file.storageKey).pipe(res);
  })
);

router.delete(
  '/question-bank/attachments/:attachmentId',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const attachment = await prisma.questionBankAttachment.findFirst({
      where: { id: req.params.attachmentId },
    });
    if (!attachment) throw notFound('Attachment not found');
    await assertBankAccess(req, attachment.bankId);
    await prisma.questionBankAttachment.delete({ where: { id: attachment.id } });
    res.status(204).end();
  })
);

/** Upload paper (JPEG/PNG/PDF/DOCX) → AI extracts questions for review (ScoreSmart parity). */
router.post(
  '/question-bank/papers',
  authenticate,
  requireRole('teacher', 'admin'),
  uploadQuestionBankPaper,
  enterTenantContext,
  asyncHandler(async (req, res) => {
    const bankId = typeof req.body.bankId === 'string' ? req.body.bankId : '';
    if (!bankId) throw badRequest('Select a question bank first');
    if (!req.file) throw badRequest('A paper file is required');

    const bank = await assertBankAccess(req, bankId);
    const paper = await createPaperAndExtract({
      tenantId: req.tenant!.id,
      bankId: bank.id,
      uploaderId: req.user!.sub,
      file: req.file,
    });
    res.status(201).json({ paper });
  })
);

router.get(
  '/question-bank/papers/:paperId',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const paper = await getPaper(req.params.paperId);
    await assertBankAccess(req, paper.bankId);
    res.json({ paper });
  })
);

router.post(
  '/question-bank/papers/:paperId/confirm',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const paper = await getPaper(req.params.paperId);
    await assertBankAccess(req, paper.bankId);
    const body = questionBankConfirmPaperSchema.parse(req.body);
    const result = await confirmPaper({
      paperId: paper.id,
      tenantId: req.tenant!.id,
      items: body.items,
    });
    res.status(201).json(result);
  })
);

export default router;

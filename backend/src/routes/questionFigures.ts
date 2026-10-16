import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole } from '../middleware/auth';
import { uploadQuestionFigure } from '../middleware/upload';
import { persistQuestionFigureUpload } from '../services/questionFigures';
import { storage } from '../services/storage';
import { notFound } from '../utils/httpError';

const router = Router({ mergeParams: true });

router.post(
  '/question-figures',
  authenticate,
  requireRole('teacher', 'admin'),
  uploadQuestionFigure,
  asyncHandler(async (req, res) => {
    const uploaded = req.file;
    if (!uploaded) {
      res.status(400).json({ error: 'No figure uploaded' });
      return;
    }
    const result = await persistQuestionFigureUpload({
      file: uploaded,
      ownerId: req.user!.sub,
      slug: req.tenant!.slug,
    });
    res.status(201).json(result);
  }),
);

router.get(
  '/question-figures/:fileId',
  authenticate,
  asyncHandler(async (req, res) => {
    const file = await prisma.file.findFirst({
      where: { id: req.params.fileId, kind: 'question_figure' },
    });
    if (!file) throw notFound('Figure not found');

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${file.originalName.replace(/"/g, '')}"`,
    );
    storage.createReadStream(file.storageKey).pipe(res);
  }),
);

export default router;

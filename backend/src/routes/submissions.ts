import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole, requireActiveEnrollment } from '../middleware/auth';
import { enterTenantContext } from '../middleware/tenant';
import { uploadSubmission } from '../middleware/upload';
import { persistUploadedFile } from '../services/files';
import { storage } from '../services/storage';
import { gradeSubmissionSchema } from '../validation/schemas';
import { badRequest, forbidden, notFound } from '../utils/httpError';
import { createNotification } from '../services/notifications';

const router = Router({ mergeParams: true });

router.post(
  '/classes/:classId/submissions',
  authenticate,
  requireRole('student'),
  requireActiveEnrollment('classId'),
  uploadSubmission,
  enterTenantContext,
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('A file is required');

    const assessmentId = (req.body?.assessmentId as string) || null;
    if (assessmentId) {
      const assessment = await prisma.material.findFirst({ where: { id: assessmentId } });
      if (!assessment || assessment.classId !== req.params.classId) {
        throw badRequest('Invalid assessment for this class');
      }
    }

    const file = await persistUploadedFile(req.file, req.user!.sub, 'submission');
    const submission = await prisma.submission.create({
      data: {
        tenantId: req.tenant!.id,
        classId: req.params.classId,
        assessmentId,
        studentId: req.user!.sub,
        fileId: file.id,
      },
      include: { file: { select: { originalName: true } } },
    });

    res.status(201).json({ submission });
  })
);

router.get(
  '/classes/:classId/submissions/mine',
  authenticate,
  requireRole('student'),
  asyncHandler(async (req, res) => {
    const submissions = await prisma.submission.findMany({
      where: { classId: req.params.classId, studentId: req.user!.sub },
      include: {
        file: { select: { originalName: true } },
        assessment: { select: { id: true, title: true, dueDate: true, maxMarks: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });
    res.json({ submissions });
  })
);

router.get(
  '/classes/:classId/submissions',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const klass = await prisma.class.findFirst({ where: { id: req.params.classId } });
    if (!klass) throw notFound('Class not found');
    if (req.user!.role === 'teacher' && klass.teacherId !== req.user!.sub) {
      throw forbidden('You can only view submissions for your own classes');
    }
    const submissions = await prisma.submission.findMany({
      where: { classId: req.params.classId },
      include: {
        student: { select: { id: true, name: true, email: true } },
        file: { select: { originalName: true } },
        assessment: {
          select: { id: true, title: true, dueDate: true, maxMarks: true, description: true },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });
    res.json({ submissions });
  })
);

// Delete a submission (student deletes own, teacher/admin deletes any in their class).
router.delete(
  '/submissions/:submissionId',
  authenticate,
  asyncHandler(async (req, res) => {
    const submission = await prisma.submission.findFirst({
      where: { id: req.params.submissionId },
      include: { file: true, class: { select: { teacherId: true } } },
    });
    if (!submission) throw notFound('Submission not found');

    const user = req.user!;
    const canDelete =
      user.role === 'admin' ||
      user.role === 'superadmin' ||
      submission.class.teacherId === user.sub ||
      submission.studentId === user.sub;
    if (!canDelete) throw forbidden('Not allowed to delete this submission');

    await prisma.submission.delete({ where: { id: submission.id } });
    if (submission.file) {
      await storage.remove(submission.file.storageKey).catch(() => undefined);
    }
    res.status(204).send();
  })
);

router.get(
  '/submissions/:submissionId/download',
  authenticate,
  asyncHandler(async (req, res) => {
    const submission = await prisma.submission.findFirst({
      where: { id: req.params.submissionId },
      include: { file: true, class: { select: { teacherId: true } } },
    });
    if (!submission) throw notFound('Submission not found');

    const user = req.user!;
    const canAccess =
      user.role === 'admin' ||
      user.role === 'superadmin' ||
      submission.class.teacherId === user.sub ||
      submission.studentId === user.sub;
    if (!canAccess) throw forbidden('Not allowed to download this submission');

    res.setHeader('Content-Type', submission.file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(submission.file.originalName)}"`
    );
    storage.createReadStream(submission.file.storageKey).pipe(res);
  })
);

router.post(
  '/submissions/:submissionId/grade',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const submission = await prisma.submission.findFirst({
      where: { id: req.params.submissionId },
      include: { class: { select: { teacherId: true } } },
    });
    if (!submission) throw notFound('Submission not found');
    if (req.user!.role === 'teacher' && submission.class.teacherId !== req.user!.sub) {
      throw forbidden('You can only grade submissions for your own classes');
    }

    const data = gradeSubmissionSchema.parse(req.body);
    const updated = await prisma.submission.update({
      where: { id: submission.id },
      data: { grade: data.grade, feedback: data.feedback },
    });

    const full = await prisma.submission.findFirst({
      where: { id: submission.id },
      include: { class: { select: { title: true } }, assessment: { select: { title: true } } },
    });
    if (full) {
      await createNotification({
        tenantId: req.tenant!.id,
        userId: full.studentId,
        type: 'grade_posted',
        title: 'Assignment graded',
        body: `${full.assessment?.title ?? 'Assignment'} in ${full.class.title}: ${data.grade}${
          data.feedback ? ` — ${data.feedback}` : ''
        }`,
        link: `/classes/${full.classId}?tab=submissions`,
      });
    }

    res.json({ submission: updated });
  })
);

export default router;

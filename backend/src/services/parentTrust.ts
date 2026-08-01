import crypto from 'crypto';
import { basePrisma } from '../lib/prisma';
import { notFound, forbidden } from '../utils/httpError';
import {
  sendMail,
  renderEmailLayout,
  emailParagraph,
  emailDetailCard,
  escapeHtml,
} from './email';
import { env } from '../config/env';
import { assertFeature } from './planGates';
import { hashToken } from '../utils/cryptoTokens';

const TOKEN_TTL_HOURS = 48;

/** Send a magic-link access email to the guardian. */
export async function sendParentMagicLink(opts: {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  studentId: string;
  actorRole?: string;
  actorId?: string;
}) {
  const tenant = await basePrisma.tenant.findUnique({ where: { id: opts.tenantId } });
  if (!tenant) throw notFound('Institute not found');
  assertFeature(tenant, 'parentTrust');

  const student = await basePrisma.user.findFirst({
    where: { id: opts.studentId, tenantId: opts.tenantId, role: 'student' },
  });
  if (!student) throw notFound('Student not found');
  if (opts.actorRole === 'teacher') {
    const enrollment = await basePrisma.enrollment.findFirst({
      where: {
        tenantId: opts.tenantId,
        studentId: student.id,
        status: 'active',
        class: { teacherId: opts.actorId },
      },
      select: { id: true },
    });
    if (!enrollment) throw forbidden('You can only send parent links for students in your active classes');
  }

  const guardianEmail = student.guardianEmail?.trim();
  if (!guardianEmail) throw forbidden('Student has no guardian email set. Update in Profile.');

  // Revoke old tokens for this student
  await basePrisma.parentToken.deleteMany({
    where: { tenantId: opts.tenantId, studentId: opts.studentId },
  });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);

  await basePrisma.parentToken.create({
    data: {
      tenantId: opts.tenantId,
      studentId: opts.studentId,
      token: hashToken(token),
      email: guardianEmail,
      expiresAt,
    },
  });

  const link = `${env.clientUrl}/${opts.tenantSlug}/parent?token=${token}`;
  const subject = `Your child's progress report — ${opts.tenantName}`;

  const html = renderEmailLayout({
    instituteName: opts.tenantName,
    preheader: `View ${student.name}'s progress and attendance`,
    eyebrow: 'Parent Report',
    title: `Progress Report for ${student.name}`,
    bodyHtml: [
      emailParagraph(`Hello <strong>${escapeHtml(student.guardianName ?? 'Guardian')}</strong>,`),
      emailParagraph(
        `${escapeHtml(opts.tenantName)} has prepared a progress report for <strong>${escapeHtml(student.name)}</strong>. Click below to view attendance, quiz scores, and fee status.`
      ),
      emailDetailCard([
        { label: 'Student', value: student.name },
        { label: 'Institute', value: opts.tenantName },
        { label: 'Link valid for', value: `${TOKEN_TTL_HOURS} hours` },
      ]),
      emailParagraph('This link is private and expires in 48 hours. Do not share it.', { muted: true }),
    ].join(''),
    cta: { label: 'View Progress Report', url: link },
  });

  const text = `Hello ${student.guardianName ?? 'Guardian'},\n\nView ${student.name}'s progress report here:\n${link}\n\nThis link expires in 48 hours.\n\n${opts.tenantName}`;

  await sendMail({
    to: guardianEmail,
    subject,
    text,
    html,
    tenantId: opts.tenantId,
    relatedType: 'parent_report',
    relatedId: student.id,
  });
  return { sent: true, to: guardianEmail };
}

/** Resolve a parent token and return the student's report data. */
export async function resolveParentToken(token: string, tenantId: string) {
  const tokenHash = hashToken(token);
  const record =
    (await basePrisma.parentToken.findUnique({ where: { token: tokenHash } })) ??
    // Temporary compatibility for links issued before token-at-rest hashing.
    (await basePrisma.parentToken.findUnique({ where: { token } }));
  if (!record) throw forbidden('Invalid or expired link.');
  if (record.tenantId !== tenantId) throw forbidden('Invalid or expired link.');
  if (record.expiresAt < new Date()) throw forbidden('This link has expired. Ask for a new one.');
  if (record.usedAt) throw forbidden('This link has already been used. Ask for a new one.');

  const consumed = await basePrisma.parentToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (consumed.count !== 1) throw forbidden('This link has already been used. Ask for a new one.');

  const studentId = record.studentId;
  const since = new Date();
  since.setDate(since.getDate() - 60);

  const [student, enrollments, attendance, attempts, payments] = await Promise.all([
    basePrisma.user.findFirst({
      where: { id: studentId },
      select: {
        id: true,
        name: true,
        guardianName: true,
        guardianPhone: true,
      },
    }),
    basePrisma.enrollment.findMany({
      where: { studentId, tenantId, status: 'active' },
      include: { class: { select: { id: true, title: true } } },
    }),
    basePrisma.attendance.findMany({
      where: { studentId, tenantId, sessionDate: { gte: since } },
      orderBy: { sessionDate: 'desc' },
    }),
    basePrisma.quizAttempt.findMany({
      where: { studentId, tenantId, submittedAt: { not: null } },
      include: { quiz: { select: { title: true, totalMarks: true, class: { select: { title: true } } } } },
      orderBy: { submittedAt: 'desc' },
      take: 20,
    }),
    basePrisma.payment.findMany({
      where: { tenantId, enrollment: { studentId } },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
  ]);

  if (!student) throw notFound('Student not found.');

  const classIds = enrollments.map((e) => e.classId);

  // Attendance summary per class
  const attendanceSummary = enrollments.map((e) => {
    const att = attendance.filter((a) => a.classId === e.classId);
    const present = att.filter((a) => a.status === 'present' || a.status === 'late').length;
    const rate = att.length > 0 ? Math.round((present / att.length) * 100) : null;
    return {
      classId: e.classId,
      className: e.class.title,
      sessions: att.length,
      present,
      rate,
    };
  });

  // Quiz performance
  const quizPerformance = attempts.map((a) => ({
    quizTitle: a.quiz.title,
    className: a.quiz.class.title,
    score: a.score ?? 0,
    totalMarks: a.quiz.totalMarks,
    percentage:
      a.quiz.totalMarks > 0
        ? Math.round(((a.score ?? 0) / a.quiz.totalMarks) * 100)
        : 0,
    submittedAt: a.submittedAt!.toISOString(),
  }));

  // Payment status
  const paymentSummary = payments.map((p) => ({
    id: p.id,
    type: p.paymentType,
    amount: Number(p.amount),
    status: p.status,
    month: p.forMonth,
    createdAt: p.createdAt.toISOString(),
  }));

  const pendingPayments = payments.filter((p) => p.status === 'pending').length;

  return {
    student,
    classes: enrollments.map((e) => ({ id: e.classId, title: e.class.title })),
    attendanceSummary,
    quizPerformance,
    paymentSummary,
    pendingPayments,
  };
}

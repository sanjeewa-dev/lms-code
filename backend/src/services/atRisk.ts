import { basePrisma } from '../lib/prisma';
import {
  sendMail,
  renderEmailLayout,
  emailParagraph,
  emailDetailCard,
  emailBulletList,
  escapeHtml,
} from './email';
import { createNotification } from './notifications';
import { env } from '../config/env';
import { runWithContext } from '../lib/tenantContext';
import { notFound } from '../utils/httpError';

export type AtRiskReason = 'low_attendance' | 'missing_assignments' | 'low_quiz_scores';

export interface AtRiskStudent {
  studentId: string;
  name: string;
  email: string;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  classIds: string[];
  classTitles: string[];
  reasons: AtRiskReason[];
  attendanceRate: number | null;
  missingAssignments: number;
  quizAveragePct: number | null;
  whatsappUrl: string | null;
}

function waLink(phone: string | null | undefined, message: string) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 9) return null;
  const normalized = digits.startsWith('0') ? `94${digits.slice(1)}` : digits;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export async function computeAtRiskStudents(tenantId: string): Promise<AtRiskStudent[]> {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const enrollments = await basePrisma.enrollment.findMany({
    where: { tenantId, status: 'active' },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          email: true,
          guardianName: true,
          guardianPhone: true,
          guardianEmail: true,
        },
      },
      class: { select: { id: true, title: true } },
    },
  });

  const byStudent = new Map<string, typeof enrollments>();
  for (const e of enrollments) {
    const list = byStudent.get(e.studentId) ?? [];
    list.push(e);
    byStudent.set(e.studentId, list);
  }

  const results: AtRiskStudent[] = [];

  for (const [studentId, enrs] of byStudent) {
    const student = enrs[0].student;
    const classIds = enrs.map((e) => e.classId);
    const classTitles = enrs.map((e) => e.class.title);
    const reasons: AtRiskReason[] = [];

    const attendance = await basePrisma.attendance.findMany({
      where: { studentId, classId: { in: classIds }, sessionDate: { gte: since } },
    });
    const present = attendance.filter((a) => a.status === 'present' || a.status === 'late').length;
    const attendanceRate = attendance.length >= 3 ? present / attendance.length : null;
    if (attendanceRate != null && attendanceRate < 0.7) reasons.push('low_attendance');

    const assessments = await basePrisma.material.findMany({
      where: { classId: { in: classIds }, kind: 'assessment', dueDate: { lte: new Date() } },
      select: { id: true },
    });
    const submitted = await basePrisma.submission.findMany({
      where: {
        studentId,
        assessmentId: { in: assessments.map((a) => a.id) },
      },
      select: { assessmentId: true },
    });
    const submittedIds = new Set(submitted.map((s) => s.assessmentId));
    const missingAssignments = assessments.filter((a) => !submittedIds.has(a.id)).length;
    if (missingAssignments >= 2) reasons.push('missing_assignments');

    const attempts = await basePrisma.quizAttempt.findMany({
      where: {
        studentId,
        submittedAt: { not: null },
        quiz: { classId: { in: classIds } },
      },
      include: { quiz: { select: { totalMarks: true } } },
    });
    let quizAveragePct: number | null = null;
    if (attempts.length >= 2) {
      const pcts = attempts
        .filter((a) => a.quiz.totalMarks > 0 && a.score != null)
        .map((a) => (a.score! / a.quiz.totalMarks) * 100);
      if (pcts.length) {
        quizAveragePct = pcts.reduce((s, n) => s + n, 0) / pcts.length;
        if (quizAveragePct < 50) reasons.push('low_quiz_scores');
      }
    }

    if (reasons.length === 0) continue;

    const msg = `Hello ${student.guardianName || 'Guardian'}, this is a message from the institute about ${student.name}'s progress. Please check in — attendance/fees/assignments may need attention.`;
    results.push({
      studentId,
      name: student.name,
      email: student.email,
      guardianName: student.guardianName,
      guardianPhone: student.guardianPhone,
      guardianEmail: student.guardianEmail,
      classIds,
      classTitles,
      reasons,
      attendanceRate: attendanceRate != null ? Math.round(attendanceRate * 100) : null,
      missingAssignments,
      quizAveragePct: quizAveragePct != null ? Math.round(quizAveragePct) : null,
      whatsappUrl: waLink(student.guardianPhone, msg),
    });
  }

  return results.sort((a, b) => b.reasons.length - a.reasons.length);
}

export async function nudgeAtRiskStudent(opts: {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  studentId: string;
  staffName: string;
}) {
  const student = await basePrisma.user.findFirst({
    where: { id: opts.studentId, tenantId: opts.tenantId, role: 'student' },
  });
  if (!student) throw notFound('Student not found');

  const risk = (await computeAtRiskStudents(opts.tenantId)).find((r) => r.studentId === student.id);
  const reasonText = risk
    ? risk.reasons
        .map((r) =>
          r === 'low_attendance'
            ? `low attendance (${risk.attendanceRate}%)`
            : r === 'missing_assignments'
              ? `${risk.missingAssignments} missing assignments`
              : `low quiz average (${risk.quizAveragePct}%)`
        )
        .join('; ')
    : 'progress concerns';

  const dash = `${env.clientUrl}/${opts.tenantSlug}/dashboard`;
  const subject = `Check-in about ${student.name} — ${opts.tenantName}`;
  const recipientName = student.guardianName || student.name;
  const reasonItems = risk
    ? risk.reasons.map((r) =>
        r === 'low_attendance'
          ? `Low attendance (${risk.attendanceRate}%)`
          : r === 'missing_assignments'
            ? `${risk.missingAssignments} missing assignment${risk.missingAssignments === 1 ? '' : 's'}`
            : `Low quiz average (${risk.quizAveragePct}%)`
      )
    : ['Progress concerns'];

  const text = [
    `Hello ${recipientName},`,
    '',
    `${opts.staffName} from ${opts.tenantName} wanted to share a quick update.`,
    `Areas to watch: ${reasonText}.`,
    '',
    `Please review progress and fees here: ${dash}`,
    '',
    `Reply to this email or contact the institute if you need help.`,
  ].join('\n');

  const html = renderEmailLayout({
    instituteName: opts.tenantName,
    preheader: `Progress check-in for ${student.name}`,
    eyebrow: 'Teacher check-in',
    title: `An update about ${student.name}`,
    bodyHtml: [
      emailParagraph(`Hello <strong>${escapeHtml(recipientName)}</strong>,`),
      emailParagraph(
        `<strong>${escapeHtml(opts.staffName)}</strong> from <strong>${escapeHtml(opts.tenantName)}</strong> wanted to share a short progress note.`
      ),
      emailDetailCard([
        { label: 'Student', value: student.name },
        { label: 'From', value: opts.staffName },
      ]),
      emailParagraph('<strong>Areas to watch</strong>'),
      emailBulletList(reasonItems),
      emailParagraph(
        'Please review attendance, assignments, and fees on the dashboard. Contact the institute if you need support.',
        { muted: true }
      ),
    ].join(''),
    cta: { label: 'Open dashboard', url: dash },
  });

  const to = student.guardianEmail?.trim() || student.email;
  await sendMail({ to, subject, text, html });

  await runWithContext({ tenantId: opts.tenantId }, async () => {
    await createNotification({
      tenantId: opts.tenantId,
      userId: student.id,
      type: 'general',
      title: 'Teacher check-in',
      body: `${opts.staffName} sent a progress nudge to your guardian contact.`,
      link: '/dashboard',
    });
  });

  return {
    emailed: to,
    whatsappUrl: risk?.whatsappUrl ?? waLink(student.guardianPhone, text),
  };
}

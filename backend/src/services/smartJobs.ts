import { basePrisma } from '../lib/prisma';
import { env } from '../config/env';
import {
  sendMail,
  sendFeeReminderEmail,
  renderEmailLayout,
  emailParagraph,
  emailDetailCard,
  emailStatGrid,
  emailBulletList,
  escapeHtml,
} from './email';
import { createNotification } from './notifications';
import { currentBillingMonth } from './access';
import { runWithContext } from '../lib/tenantContext';
import { netClassFee } from '../lib/fees';
import { badRequest, forbidden, notFound } from '../utils/httpError';

function paymentUrl(slug: string) {
  return `${env.clientUrl}/${slug}/payments`;
}

/** True during the last 7 calendar days of the month (inclusive). */
export function isLastWeekOfMonth(date = new Date()) {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return date.getDate() > lastDay - 7;
}

/** Students with active enrollment who still need this month's approved payment. */
export async function findUnpaidActiveEnrollments(tenantId: string, forMonth: string) {
  const enrollments = await basePrisma.enrollment.findMany({
    where: {
      tenantId,
      status: 'active',
      class: { price: { gt: 0 } },
    },
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
      class: { select: { id: true, title: true, price: true } },
      payments: {
        where: { forMonth, status: { in: ['approved', 'pending'] } },
        select: { status: true },
      },
    },
  });

  return enrollments.filter((e) => !e.payments.some((p) => p.status === 'approved'));
}

export async function sendFeeRemindersForTenant(
  tenantId: string,
  opts?: { force?: boolean }
) {
  const tenant = await basePrisma.tenant.findFirst({ where: { id: tenantId } });
  if (!tenant?.requireMonthlyPayment) return { sent: 0, skipped: true };

  const now = new Date();
  // Automated reminders only run in the last week of each month (manual admin can force).
  if (!opts?.force && !isLastWeekOfMonth(now)) {
    return { sent: 0, tooEarly: true, window: 'outside_last_week' as const };
  }

  const forMonth = currentBillingMonth(now);
  const unpaid = await findUnpaidActiveEnrollments(tenantId, forMonth);
  let sent = 0;

  await runWithContext({ tenantId }, async () => {
    for (const e of unpaid) {
      const payLink = paymentUrl(tenant.slug);
      const amount = Number(e.class.price).toLocaleString();
      const graceNote = tenant.graceDays
        ? `Access may be limited after day ${tenant.graceDays} of the month if payment is not approved.`
        : '';
      const subject = `Fee reminder: ${e.class.title} (${forMonth})`;
      const text = [
        `Hello ${e.student.name},`,
        '',
        `This is a reminder that the monthly fee for "${e.class.title}" (Rs. ${amount}) for ${forMonth} is due.`,
        `Please upload your bank slip or pay online: ${payLink}`,
        '',
        graceNote,
        '',
        `— ${tenant.name}`,
      ]
        .filter(Boolean)
        .join('\n');

      const html = renderEmailLayout({
        instituteName: tenant.name,
        preheader: `Rs. ${amount} due for ${e.class.title} (${forMonth})`,
        eyebrow: 'Fee reminder',
        title: 'Monthly fee is due',
        bodyHtml: [
          emailParagraph(`Hello <strong>${escapeHtml(e.student.name)}</strong>,`),
          emailParagraph(
            `Please settle this month’s fee so your class access stays uninterrupted.`
          ),
          emailDetailCard([
            { label: 'Class', value: e.class.title },
            { label: 'Month', value: forMonth },
            { label: 'Amount', value: `Rs. ${amount}` },
          ]),
          graceNote ? emailParagraph(escapeHtml(graceNote), { muted: true }) : '',
        ].join(''),
        cta: { label: 'Pay now / upload slip', url: payLink },
      });

      await sendMail({ to: e.student.email, subject, text, html });

      const guardianTo = e.student.guardianEmail?.trim();
      if (guardianTo) {
        const gName = e.student.guardianName || 'Guardian';
        await sendMail({
          to: guardianTo,
          subject: `Parent notice: fee due for ${e.student.name}`,
          text: `Dear ${gName},\n\nThe monthly fee for ${e.student.name} in ${e.class.title} (Rs. ${amount}) for ${forMonth} is due.\nPay here: ${payLink}\n\n— ${tenant.name}`,
          html: renderEmailLayout({
            instituteName: tenant.name,
            preheader: `Fee due for ${e.student.name} — ${e.class.title}`,
            eyebrow: 'Parent notice',
            title: 'Fee reminder for your child',
            bodyHtml: [
              emailParagraph(`Dear <strong>${escapeHtml(gName)}</strong>,`),
              emailParagraph(
                `The monthly fee for <strong>${escapeHtml(e.student.name)}</strong> is still outstanding.`
              ),
              emailDetailCard([
                { label: 'Student', value: e.student.name },
                { label: 'Class', value: e.class.title },
                { label: 'Month', value: forMonth },
                { label: 'Amount', value: `Rs. ${amount}` },
              ]),
            ].join(''),
            cta: { label: 'Open payments', url: payLink },
          }),
        });
      }

      await createNotification({
        tenantId,
        userId: e.student.id,
        type: 'general',
        title: 'Fee reminder',
        body: `${e.class.title} fee for ${forMonth} is due (Rs. ${amount}).`,
        link: '/payments',
      });
      sent += 1;
    }
  });

  return { sent, forMonth, unpaid: unpaid.length };
}

function formatMonthLabelLong(forMonth: string) {
  const [year, month] = forMonth.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

async function monthNeedsFeeReminder(enrollmentId: string, forMonth: string, netFee: number) {
  if (netFee <= 0) return false;
  const payment = await basePrisma.payment.findFirst({
    where: {
      enrollmentId,
      forMonth,
      paymentType: { in: ['enrollment', 'monthly'] },
    },
    orderBy: { createdAt: 'desc' },
    select: { status: true },
  });
  if (!payment) return true;
  if (payment.status === 'approved' || payment.status === 'pending') return false;
  return true;
}

/**
 * Teacher/admin manual fee reminder for one enrollment.
 * Uses LMS Code's currentBillingMonth (not Smart's previous-month gate).
 * Sends via NMS template payment.fee_reminder.
 */
export async function sendEnrollmentFeeReminder(opts: {
  tenantId: string;
  classId: string;
  studentId: string;
  teacherId?: string | null;
  actorRole: string;
}) {
  const tenant = await basePrisma.tenant.findFirst({ where: { id: opts.tenantId } });
  if (!tenant) throw notFound('Institute not found');

  const enrollment = await basePrisma.enrollment.findFirst({
    where: {
      tenantId: opts.tenantId,
      classId: opts.classId,
      studentId: opts.studentId,
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          email: true,
          guardianName: true,
          guardianEmail: true,
        },
      },
      class: { select: { id: true, title: true, price: true, teacherId: true } },
    },
  });
  if (!enrollment) throw notFound('Student is not enrolled in this class');
  if (opts.actorRole === 'teacher' && enrollment.class.teacherId !== opts.teacherId) {
    throw forbidden('You can only remind students in your own classes');
  }
  if (enrollment.status !== 'active') {
    throw badRequest('Fee reminders can only be sent for active enrollments');
  }

  const netFee = netClassFee(enrollment.class.price, enrollment.feeWaiverAmount);
  if (netFee <= 0) {
    throw badRequest('This student has no fee due (waived or free class)');
  }

  const forMonth = currentBillingMonth();
  if (!(await monthNeedsFeeReminder(enrollment.id, forMonth, netFee))) {
    throw badRequest('No unpaid fee for this month (already paid or pending review)');
  }

  const forMonthLabel = formatMonthLabelLong(forMonth);
  const amountDue = `Rs. ${netFee.toLocaleString()}`;
  const paymentsUrl = paymentUrl(tenant.slug);
  const relatedId = `${enrollment.id}:manual:${forMonth}:${Date.now()}`;

  await sendFeeReminderEmail({
    to: enrollment.student.email,
    studentName: enrollment.student.name,
    classTitle: enrollment.class.title,
    instituteName: tenant.name,
    forMonthLabel,
    amountDue,
    paymentsUrl,
    tenantId: opts.tenantId,
    relatedId,
    guardian: enrollment.student.guardianEmail?.trim()
      ? {
          name: enrollment.student.guardianName || 'Guardian',
          email: enrollment.student.guardianEmail.trim(),
        }
      : null,
  });

  await createNotification({
    tenantId: opts.tenantId,
    userId: enrollment.student.id,
    type: 'general',
    title: 'Fee reminder',
    body: `${enrollment.class.title} fee for ${forMonthLabel} is due (${amountDue}).`,
    link: '/payments',
  });

  return {
    sent: true,
    months: [forMonth],
    monthLabels: [forMonthLabel],
    amount: netFee,
    emailed: enrollment.student.email,
  };
}

export async function sendParentDigestsForTenant(tenantId: string) {
  const tenant = await basePrisma.tenant.findFirst({ where: { id: tenantId } });
  if (!tenant) return { sent: 0 };

  const students = await basePrisma.user.findMany({
    where: { tenantId, role: 'student', status: 'approved' },
    select: {
      id: true,
      name: true,
      email: true,
      guardianName: true,
      guardianPhone: true,
      guardianEmail: true,
      enrollments: {
        where: { status: 'active' },
        include: { class: { select: { id: true, title: true } } },
      },
    },
  });

  const since = new Date();
  since.setDate(since.getDate() - 7);
  const forMonth = currentBillingMonth();
  let sent = 0;
  const dash = `${env.clientUrl}/${tenant.slug}/dashboard`;

  for (const s of students) {
    if (s.enrollments.length === 0) continue;
    const classIds = s.enrollments.map((e) => e.classId);

    const [attendance, attempts, overdue] = await Promise.all([
      basePrisma.attendance.findMany({
        where: { studentId: s.id, classId: { in: classIds }, sessionDate: { gte: since } },
      }),
      basePrisma.quizAttempt.findMany({
        where: { studentId: s.id, submittedAt: { gte: since }, quiz: { classId: { in: classIds } } },
        include: { quiz: { select: { title: true, totalMarks: true } } },
      }),
      findUnpaidActiveEnrollments(tenantId, forMonth).then((list) =>
        list.filter((e) => e.studentId === s.id)
      ),
    ]);

    const present = attendance.filter((a) => a.status === 'present' || a.status === 'late').length;
    const attendPct = attendance.length ? Math.round((present / attendance.length) * 100) : null;
    const classTitles = s.enrollments.map((e) => e.class.title);

    const lines = [
      `Weekly update for ${s.name} at ${tenant.name}`,
      '',
      `Classes: ${classTitles.join(', ')}`,
      attendPct != null
        ? `Attendance (7 days): ${attendPct}% (${present}/${attendance.length})`
        : 'Attendance: no sessions marked',
      attempts.length
        ? `Quizzes this week:\n${attempts.map((a) => `  - ${a.quiz.title}: ${a.score}/${a.quiz.totalMarks}`).join('\n')}`
        : 'Quizzes this week: none',
      overdue.length
        ? `Fees due: ${overdue.map((e) => e.class.title).join(', ')} — ${paymentUrl(tenant.slug)}`
        : 'Fees: up to date for this month',
      '',
      `Dashboard: ${dash}`,
    ];

    const text = lines.join('\n');
    const quizItems = attempts.map((a) => `${a.quiz.title}: ${a.score}/${a.quiz.totalMarks}`);
    const feeItems = overdue.length
      ? overdue.map((e) => `${e.class.title} — due for ${forMonth}`)
      : [];

    const html = renderEmailLayout({
      instituteName: tenant.name,
      preheader: `Weekly progress for ${s.name}`,
      eyebrow: 'Weekly digest',
      title: `Progress update for ${s.name}`,
      bodyHtml: [
        emailParagraph(
          `Here is a 7-day summary for <strong>${escapeHtml(s.name)}</strong> at <strong>${escapeHtml(tenant.name)}</strong>.`
        ),
        emailStatGrid([
          {
            label: 'Attendance',
            value: attendPct != null ? `${attendPct}%` : '—',
          },
          {
            label: 'Quizzes',
            value: String(attempts.length),
          },
          {
            label: 'Fees',
            value: overdue.length ? `${overdue.length} due` : 'Clear',
          },
        ]),
        emailDetailCard([
          { label: 'Classes', value: classTitles.join(', ') || '—' },
          {
            label: 'Sessions',
            value:
              attendPct != null
                ? `${present} present / late of ${attendance.length}`
                : 'No sessions marked this week',
          },
        ]),
        quizItems.length
          ? `${emailParagraph('<strong>Quizzes this week</strong>')}${emailBulletList(quizItems)}`
          : emailParagraph('No quiz attempts submitted this week.', { muted: true }),
        feeItems.length
          ? `${emailParagraph('<strong>Fees outstanding</strong>')}${emailBulletList(feeItems)}`
          : emailParagraph('Fees are up to date for this month.', { muted: true }),
      ].join(''),
      cta: { label: 'Open dashboard', url: dash },
    });

    const subject = `Weekly progress: ${s.name} — ${tenant.name}`;

    const recipients = new Set<string>();
    if (s.guardianEmail?.trim()) recipients.add(s.guardianEmail.trim());
    else recipients.add(s.email);

    for (const to of recipients) {
      await sendMail({ to, subject, text, html });
      sent += 1;
    }

    await runWithContext({ tenantId }, async () => {
      await createNotification({
        tenantId,
        userId: s.id,
        type: 'general',
        title: 'Weekly progress digest sent',
        body: attendPct != null ? `Attendance ${attendPct}% this week.` : 'Check your dashboard for updates.',
        link: '/dashboard',
      });
    });
  }

  return { sent };
}

export async function runFeeRemindersAllTenants() {
  const tenants = await basePrisma.tenant.findMany({ where: { isActive: true }, select: { id: true, slug: true } });
  const results = [];
  for (const t of tenants) {
    results.push({ slug: t.slug, ...(await sendFeeRemindersForTenant(t.id)) });
  }
  return results;
}

export async function runParentDigestsAllTenants() {
  const tenants = await basePrisma.tenant.findMany({ where: { isActive: true }, select: { id: true, slug: true } });
  const results = [];
  for (const t of tenants) {
    results.push({ slug: t.slug, ...(await sendParentDigestsForTenant(t.id)) });
  }
  return results;
}

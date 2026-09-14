import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { basePrisma } from '../lib/prisma';
import {
  emailDetailCard,
  emailParagraph,
  escapeHtml,
  renderEmailLayout,
} from './emailLayout';
import { dispatchCommunication } from './nmsClient';

function mailFrom() {
  // Gmail requires the From address to match the authenticated account.
  if (env.smtp.user && env.smtp.from.includes('lms.local')) {
    return `"Mindspark LMS" <${env.smtp.user}>`;
  }
  return env.smtp.from;
}

const transporter =
  env.smtp.host && env.smtp.user
    ? nodemailer.createTransport({
        host: env.smtp.host,
        port: env.smtp.port,
        secure: env.smtp.secure,
        auth: { user: env.smtp.user, pass: env.smtp.pass },
      })
    : null;

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
  tenantId?: string | null;
  relatedType?: string;
  relatedId?: string;
}) {
  if (!transporter) {
    // Email bodies can contain password-reset, invitation, and magic-link
    // tokens. Never write them to logs when delivery is unavailable.
    console.warn('[email] SMTP is not configured; message was not sent');
    try {
      await basePrisma.emailLog.create({
        data: {
          tenantId: opts.tenantId ?? undefined,
          to: opts.to,
          subject: opts.subject,
          status: 'skipped',
          relatedType: opts.relatedType,
          relatedId: opts.relatedId,
          error: 'SMTP not configured',
        },
      });
    } catch {
      /* ignore log failures */
    }
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: mailFrom(),
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    console.log(`[email] Sent to ${opts.to} (messageId: ${info.messageId})`);
    try {
      await basePrisma.emailLog.create({
        data: {
          tenantId: opts.tenantId ?? undefined,
          to: opts.to,
          subject: opts.subject,
          status: 'sent',
          providerId: info.messageId,
          relatedType: opts.relatedType,
          relatedId: opts.relatedId,
        },
      });
    } catch {
      /* ignore log failures */
    }
  } catch (err) {
    console.error('[email] Failed to send:', err);
    try {
      await basePrisma.emailLog.create({
        data: {
          tenantId: opts.tenantId ?? undefined,
          to: opts.to,
          subject: opts.subject,
          status: 'failed',
          relatedType: opts.relatedType,
          relatedId: opts.relatedId,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export async function sendStudentClassInvite(opts: {
  to: string;
  studentName: string;
  instituteName: string;
  classTitle: string;
  inviteUrl: string;
  tenantId: string;
  relatedId: string;
}) {
  const { to, studentName, instituteName, classTitle, inviteUrl, tenantId, relatedId } = opts;
  await dispatchCommunication({
    tenantId,
    templateId: 'class.invite',
    idempotencyKey: `${tenantId}:invite:${relatedId}:v1`,
    header: { subjectLine: `You're invited to join ${classTitle} at ${instituteName}` },
    content: {
      containerTitle: classTitle,
      instituteName,
      inviteUrl,
      expiresInDays: '7',
    },
    receivers: [{ name: studentName, email: to }],
    relatedType: 'student_invite',
    relatedId,
  });
}

export async function sendAdminInvite(opts: {
  to: string;
  instituteName: string;
  inviteUrl: string;
  tenantId?: string;
  relatedId?: string;
}) {
  const { to, instituteName, inviteUrl, tenantId, relatedId } = opts;
  const subject = `You're invited to administer ${instituteName}`;
  const text = [
    `Hello,`,
    '',
    `You have been invited to become an administrator for ${instituteName} on Mindspark LMS.`,
    '',
    `Set up your account here:`,
    inviteUrl,
    '',
    `This link expires in 7 days.`,
    '',
    `If you did not expect this email, you can ignore it.`,
  ].join('\n');

  const html = renderEmailLayout({
    instituteName,
    preheader: `Admin invitation for ${instituteName}`,
    eyebrow: 'Admin invitation',
    title: `You're invited to administer ${instituteName}`,
    bodyHtml: [
      emailParagraph('Hello,'),
      emailParagraph(
        `Complete your account setup to become an administrator for <strong>${escapeHtml(instituteName)}</strong>.`
      ),
      emailDetailCard([
        { label: 'Institute', value: instituteName },
        { label: 'Role', value: 'Institute admin' },
        { label: 'Expires', value: 'In 7 days' },
      ]),
      emailParagraph('If you did not expect this email, you can safely ignore it.', { muted: true }),
    ].join(''),
    cta: { label: 'Set up your account', url: inviteUrl },
    footerNote: `This invitation was sent for ${instituteName}.`,
  });

  await sendMail({
    to,
    subject,
    text,
    html,
    tenantId,
    relatedType: 'admin_invite',
    relatedId,
  });
}

export async function sendLiveClassStarted(opts: {
  students: { name: string; email: string }[];
  teacherName: string;
  className: string;
  instituteName: string;
  joinUrl: string;
  tenantId: string;
  relatedId: string;
  /** Distinguishes start-session fan-out vs explicit live invite. */
  idempotencyKind: 'live-start' | 'live-invite';
}) {
  const {
    students,
    teacherName,
    className,
    instituteName,
    joinUrl,
    tenantId,
    relatedId,
    idempotencyKind,
  } = opts;
  await dispatchCommunication({
    tenantId,
    templateId: 'session.live_started',
    idempotencyKey: `${tenantId}:${idempotencyKind}:${relatedId}:v1`,
    header: { subjectLine: `Live class started: ${className}` },
    content: {
      containerTitle: className,
      teacherName,
      instituteName,
      joinUrl,
    },
    receivers: students.map((s) => ({ name: s.name, email: s.email })),
    relatedType: 'live_class',
    relatedId,
  });
}

export async function sendStudentEnrolledNotice(opts: {
  to: string;
  studentName: string;
  instituteName: string;
  classTitle: string;
  loginUrl: string;
  tenantId: string;
  relatedId: string;
}) {
  const { to, studentName, instituteName, classTitle, loginUrl, tenantId, relatedId } = opts;
  await dispatchCommunication({
    tenantId,
    templateId: 'class.enrolled',
    idempotencyKey: `${tenantId}:enroll:${relatedId}:v1`,
    header: { subjectLine: `You've been enrolled in ${classTitle}` },
    content: {
      containerTitle: classTitle,
      instituteName,
      loginUrl,
    },
    receivers: [{ name: studentName, email: to }],
    relatedType: 'enrollment',
    relatedId,
  });
}

/**
 * Password reset via NMS when the user has a tenant.
 * Superadmin (null tenantId): NMS JWT requires a tenantId, so fall back to SMTP
 * sendMail for that edge case only.
 */
export async function sendPasswordResetEmail(opts: {
  to: string;
  name: string;
  instituteName: string;
  resetUrl: string;
  tenantId?: string | null;
  relatedId?: string;
}) {
  const { to, name, instituteName, resetUrl, tenantId, relatedId } = opts;

  if (tenantId) {
    await dispatchCommunication({
      tenantId,
      templateId: 'auth.password_reset',
      idempotencyKey: `${tenantId}:password-reset:${relatedId ?? to}:${Date.now()}`,
      header: { subjectLine: `Reset your ${instituteName} password` },
      content: {
        instituteName,
        resetUrl,
        expiresInHours: '1',
      },
      receivers: [{ name, email: to }],
      relatedType: 'password_reset',
      relatedId,
    });
    return;
  }

  console.warn(
    '[password-reset] No tenantId for NMS; falling back to SMTP for superadmin password reset'
  );

  const subject = `Reset your ${instituteName} password`;
  const text = [
    `Hello ${name},`,
    '',
    `We received a request to reset your Mindspark LMS password for ${instituteName}.`,
    '',
    `Reset your password here (link expires in 1 hour):`,
    resetUrl,
    '',
    `If you did not request this, you can ignore this email.`,
  ].join('\n');

  const html = renderEmailLayout({
    instituteName,
    preheader: `Password reset for ${instituteName}`,
    eyebrow: 'Password reset',
    title: 'Reset your password',
    bodyHtml: [
      emailParagraph(`Hello <strong>${escapeHtml(name)}</strong>,`),
      emailParagraph(
        `Use the button below to choose a new password for your <strong>${escapeHtml(instituteName)}</strong> account. This link expires in <strong>1 hour</strong>.`
      ),
      emailParagraph('If you did not request a password reset, you can safely ignore this email.', {
        muted: true,
      }),
    ].join(''),
    cta: { label: 'Reset password', url: resetUrl },
    footerNote: `This message was sent by ${instituteName} via Mindspark LMS.`,
  });

  await sendMail({
    to,
    subject,
    text,
    html,
    tenantId: undefined,
    relatedType: 'password_reset',
    relatedId,
  });
}

/** Per-student / bulk fee reminder via NMS. */
export async function sendFeeReminderEmail(opts: {
  to: string;
  studentName: string;
  classTitle: string;
  instituteName: string;
  forMonthLabel: string;
  amountDue: string;
  paymentsUrl: string;
  tenantId: string;
  relatedId: string;
  guardian?: { name: string; email: string } | null;
}) {
  const {
    to,
    studentName,
    classTitle,
    instituteName,
    forMonthLabel,
    amountDue,
    paymentsUrl,
    tenantId,
    relatedId,
    guardian,
  } = opts;

  await dispatchCommunication({
    tenantId,
    templateId: 'payment.fee_reminder',
    idempotencyKey: `${tenantId}:fee-reminder:${relatedId}:v1`,
    header: { subjectLine: `Fee reminder: ${classTitle} (${forMonthLabel})` },
    content: {
      studentName,
      classTitle,
      instituteName,
      forMonthLabel,
      amountDue,
      paymentsUrl,
    },
    receivers: [{ name: studentName, email: to }],
    relatedType: 'fee_reminder',
    relatedId,
  });

  if (guardian?.email) {
    await dispatchCommunication({
      tenantId,
      templateId: 'payment.fee_reminder',
      idempotencyKey: `${tenantId}:fee-reminder:${relatedId}:guardian:v1`,
      header: {
        subjectLine: `Parent notice: fee due for ${studentName}`,
      },
      content: {
        studentName,
        classTitle,
        instituteName,
        forMonthLabel,
        amountDue,
        paymentsUrl,
      },
      receivers: [{ name: guardian.name || 'Guardian', email: guardian.email }],
      relatedType: 'fee_reminder',
      relatedId: `${relatedId}:guardian`,
    });
  }
}

export {
  renderEmailLayout,
  emailDetailCard,
  emailParagraph,
  emailStatGrid,
  emailBulletList,
  escapeHtml,
} from './emailLayout';

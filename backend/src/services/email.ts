import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { basePrisma } from '../lib/prisma';
import {
  emailDetailCard,
  emailParagraph,
  escapeHtml,
  renderEmailLayout,
} from './emailLayout';

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
}) {
  const { to, studentName, instituteName, classTitle, inviteUrl } = opts;
  const subject = `You're invited to join ${classTitle} at ${instituteName}`;
  const text = [
    `Hello ${studentName},`,
    '',
    `You have been invited to register for "${classTitle}" at ${instituteName}.`,
    '',
    `Complete your registration here:`,
    inviteUrl,
    '',
    `This link expires in 7 days.`,
    '',
    `If you did not expect this email, you can ignore it.`,
  ].join('\n');

  const html = renderEmailLayout({
    instituteName,
    preheader: `Register for ${classTitle} — invitation from ${instituteName}`,
    eyebrow: 'Class invitation',
    title: `You're invited to ${classTitle}`,
    bodyHtml: [
      emailParagraph(`Hello <strong>${escapeHtml(studentName)}</strong>,`),
      emailParagraph(
        `Complete your registration to join <strong>${escapeHtml(classTitle)}</strong> at <strong>${escapeHtml(instituteName)}</strong>.`
      ),
      emailDetailCard([
        { label: 'Institute', value: instituteName },
        { label: 'Class', value: classTitle },
        { label: 'Expires', value: 'In 7 days' },
      ]),
      emailParagraph('If you did not expect this email, you can safely ignore it.', { muted: true }),
    ].join(''),
    cta: { label: 'Complete registration', url: inviteUrl },
    footerNote: `This invitation was sent by ${instituteName}.`,
  });

  await sendMail({ to, subject, text, html });
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
  to: string;
  studentName: string;
  teacherName: string;
  className: string;
  instituteName: string;
  joinUrl: string;
  tenantId?: string;
}) {
  const { to, studentName, teacherName, className, instituteName, joinUrl, tenantId } = opts;
  const subject = `🔴 Live class started: ${className}`;
  const text = [
    `Hello ${studentName},`,
    '',
    `${teacherName} has just started a live class for "${className}" at ${instituteName}.`,
    '',
    `Join now: ${joinUrl}`,
  ].join('\n');

  const html = renderEmailLayout({
    instituteName,
    preheader: `${teacherName} started a live class — join now`,
    eyebrow: 'Live class started',
    title: `Join live: ${className}`,
    bodyHtml: [
      emailParagraph(`Hello <strong>${escapeHtml(studentName)}</strong>,`),
      emailParagraph(
        `<strong>${escapeHtml(teacherName)}</strong> has just started a live class for <strong>${escapeHtml(className)}</strong> at <strong>${escapeHtml(instituteName)}</strong>. Join now to attend.`
      ),
      emailDetailCard([
        { label: 'Teacher', value: teacherName },
        { label: 'Class', value: className },
      ]),
    ].join(''),
    cta: { label: 'Join live class now', url: joinUrl },
    footerNote: `You received this because you are enrolled in ${className}.`,
  });

  await sendMail({ to, subject, text, html, tenantId, relatedType: 'live_class' });
}

export async function sendStudentEnrolledNotice(opts: {
  to: string;
  studentName: string;
  instituteName: string;
  classTitle: string;
  loginUrl: string;
}) {
  const { to, studentName, instituteName, classTitle, loginUrl } = opts;
  const subject = `You've been enrolled in ${classTitle}`;
  const text = [
    `Hello ${studentName},`,
    '',
    `You have been added to "${classTitle}" at ${instituteName}.`,
    '',
    `Sign in to access your class: ${loginUrl}`,
  ].join('\n');

  const html = renderEmailLayout({
    instituteName,
    preheader: `You're enrolled in ${classTitle}`,
    eyebrow: 'Enrollment confirmed',
    title: `Welcome to ${classTitle}`,
    bodyHtml: [
      emailParagraph(`Hello <strong>${escapeHtml(studentName)}</strong>,`),
      emailParagraph(
        `You have been added to <strong>${escapeHtml(classTitle)}</strong> at <strong>${escapeHtml(instituteName)}</strong>. Sign in to access materials, live classes, and payments.`
      ),
      emailDetailCard([
        { label: 'Institute', value: instituteName },
        { label: 'Class', value: classTitle },
      ]),
    ].join(''),
    cta: { label: 'Sign in to your class', url: loginUrl },
  });

  await sendMail({ to, subject, text, html });
}

export {
  renderEmailLayout,
  emailDetailCard,
  emailParagraph,
  emailStatGrid,
  emailBulletList,
  escapeHtml,
} from './emailLayout';

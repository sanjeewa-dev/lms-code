import nodemailer from 'nodemailer';
import { env } from '../config/env';

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

export async function sendMail(opts: { to: string; subject: string; text: string; html: string }) {
  if (!transporter) {
    console.log('\n--- EMAIL (SMTP not configured — logged to console) ---');
    console.log(`To: ${opts.to}`);
    console.log(`Subject: ${opts.subject}`);
    console.log(opts.text);
    console.log('---\n');
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
  } catch (err) {
    console.error('[email] Failed to send:', err);
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

  const html = `
    <p>Hello <strong>${studentName}</strong>,</p>
    <p>You have been invited to register for <strong>${classTitle}</strong> at <strong>${instituteName}</strong>.</p>
    <p><a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Complete registration</a></p>
    <p style="color:#64748b;font-size:14px;">Or copy this link: ${inviteUrl}</p>
    <p style="color:#64748b;font-size:14px;">This link expires in 7 days.</p>
  `;

  await sendMail({ to, subject, text, html });
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

  const html = `
    <p>Hello <strong>${studentName}</strong>,</p>
    <p>You have been added to <strong>${classTitle}</strong> at <strong>${instituteName}</strong>.</p>
    <p><a href="${loginUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Sign in</a></p>
  `;

  await sendMail({ to, subject, text, html });
}

import { prisma } from '../lib/prisma';

export function normalizeSubject(subject?: string | null) {
  const s = (subject ?? '').trim();
  return s || 'General';
}

export function normalizeGrade(grade?: string | null) {
  return (grade ?? '').trim();
}

/** Ensure a question bank exists for teacher + subject + optional grade. */
export async function ensureQuestionBank(params: {
  tenantId: string;
  ownerId: string;
  subject: string;
  grade?: string | null;
  title?: string;
}) {
  const subject = normalizeSubject(params.subject);
  const grade = normalizeGrade(params.grade);
  let bank = await prisma.questionBank.findFirst({
    where: {
      tenantId: params.tenantId,
      ownerId: params.ownerId,
      subject,
      grade,
    },
  });
  if (!bank) {
    const title =
      params.title?.trim() ||
      (grade ? `${subject} · ${grade}` : `${subject} question bank`);
    bank = await prisma.questionBank.create({
      data: {
        tenantId: params.tenantId,
        ownerId: params.ownerId,
        subject,
        grade,
        title,
      },
    });
  }
  return bank;
}

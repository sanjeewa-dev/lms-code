import { Prisma } from '@prisma/client';

export function isPrismaUniqueConstraint(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return true;
  if ('code' in err && (err as { code?: string }).code === 'P2002') return true;
  if ('cause' in err) return isPrismaUniqueConstraint((err as { cause?: unknown }).cause);
  const message = err instanceof Error ? err.message : String(err);
  return /unique constraint/i.test(message);
}

import { basePrisma } from '../lib/prisma';
import type { Prisma } from '@prisma/client';

export async function startJobRun(opts: {
  job: string;
  tenantId?: string | null;
}) {
  return basePrisma.jobRun.create({
    data: {
      job: opts.job,
      tenantId: opts.tenantId ?? undefined,
      status: 'running',
    },
  });
}

export async function finishJobRun(
  id: string,
  opts: { status: 'success' | 'failed'; result?: Prisma.InputJsonValue; error?: string }
) {
  return basePrisma.jobRun.update({
    where: { id },
    data: {
      status: opts.status,
      finishedAt: new Date(),
      result: opts.result ?? undefined,
      error: opts.error,
    },
  });
}

export async function runTrackedJob<T>(
  job: string,
  fn: () => Promise<T>,
  tenantId?: string | null
): Promise<T> {
  const run = await startJobRun({ job, tenantId });
  try {
    const result = await fn();
    await finishJobRun(run.id, {
      status: 'success',
      result: (result ?? null) as Prisma.InputJsonValue,
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishJobRun(run.id, { status: 'failed', error: message });
    throw err;
  }
}

import { prisma } from '../lib/prisma';
import type { NotificationType } from '@prisma/client';

export async function createNotification(opts: {
  tenantId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string | null;
}) {
  return prisma.notification.create({
    data: {
      tenantId: opts.tenantId,
      userId: opts.userId,
      type: opts.type,
      title: opts.title,
      body: opts.body ?? '',
      link: opts.link ?? null,
    },
  });
}

export async function createNotifications(
  items: {
    tenantId: string;
    userId: string;
    type: NotificationType;
    title: string;
    body?: string;
    link?: string | null;
  }[]
) {
  if (items.length === 0) return;
  await prisma.notification.createMany({
    data: items.map((i) => ({
      tenantId: i.tenantId,
      userId: i.userId,
      type: i.type,
      title: i.title,
      body: i.body ?? '',
      link: i.link ?? null,
    })),
  });
}

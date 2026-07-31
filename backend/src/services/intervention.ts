import { prisma } from '../lib/prisma';
import { notFound, forbidden } from '../utils/httpError';
import { assertFeature } from './planGates';

export type InterventionStatus = 'open' | 'in_progress' | 'resolved' | 'escalated';

export async function listInterventions(opts: {
  tenantId: string;
  studentId?: string;
  status?: InterventionStatus;
}) {
  const interventions = await prisma.intervention.findMany({
    where: {
      tenantId: opts.tenantId,
      ...(opts.studentId ? { studentId: opts.studentId } : {}),
      ...(opts.status ? { status: opts.status } : {}),
    },
    include: {
      student: { select: { id: true, name: true, email: true, guardianName: true, guardianPhone: true } },
      createdBy: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return interventions;
}

export async function createIntervention(opts: {
  tenantId: string;
  createdById: string;
  studentId: string;
  reason: string;
  action: string;
  followUpDate?: string;
}) {
  const tenant = await prisma.tenant.findUnique({ where: { id: opts.tenantId } });
  if (!tenant) throw notFound('Institute not found');
  assertFeature(tenant, 'interventions');

  const student = await prisma.user.findFirst({
    where: { id: opts.studentId, tenantId: opts.tenantId, role: 'student' },
  });
  if (!student) throw notFound('Student not found');

  return prisma.intervention.create({
    data: {
      tenantId: opts.tenantId,
      studentId: opts.studentId,
      createdById: opts.createdById,
      reason: opts.reason,
      action: opts.action,
      status: 'open',
      followUpDate: opts.followUpDate ? new Date(opts.followUpDate) : undefined,
    },
    include: {
      student: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
}

export async function updateIntervention(opts: {
  tenantId: string;
  id: string;
  updaterId: string;
  updaterRole: string;
  status?: InterventionStatus;
  action?: string;
  followUpDate?: string | null;
  resolvedNote?: string;
}) {
  const existing = await prisma.intervention.findFirst({
    where: { id: opts.id, tenantId: opts.tenantId },
  });
  if (!existing) throw notFound('Intervention not found');

  if (
    opts.updaterRole !== 'admin' &&
    opts.updaterRole !== 'superadmin' &&
    existing.createdById !== opts.updaterId
  ) {
    throw forbidden('Not allowed to update this intervention');
  }

  const resolvedAt =
    opts.status === 'resolved' && existing.status !== 'resolved' ? new Date() : undefined;

  return prisma.intervention.update({
    where: { id: opts.id },
    data: {
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.action !== undefined ? { action: opts.action } : {}),
      ...(opts.followUpDate !== undefined
        ? { followUpDate: opts.followUpDate ? new Date(opts.followUpDate) : null }
        : {}),
      ...(opts.resolvedNote !== undefined ? { resolvedNote: opts.resolvedNote } : {}),
      ...(resolvedAt ? { resolvedAt } : {}),
    },
    include: {
      student: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
}

export async function getInterventionTimeline(opts: { tenantId: string; studentId: string }) {
  const interventions = await prisma.intervention.findMany({
    where: { tenantId: opts.tenantId, studentId: opts.studentId },
    include: {
      createdBy: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return interventions;
}

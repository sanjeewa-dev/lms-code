import type { MaterialOrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { badRequest, forbidden, notFound } from '../utils/httpError';

export const MATERIAL_ORDER_INCLUDE = {
  items: {
    include: {
      material: { select: { id: true, title: true } },
      class: {
        select: {
          id: true,
          title: true,
          teacherId: true,
          batch: { select: { name: true } },
          teacher: {
            select: {
              id: true,
              name: true,
              phone: true,
              address: true,
              shippingLabelPhotoFileId: true,
              shippingLabelPhotoOnly: true,
            },
          },
        },
      },
    },
  },
  student: { select: { id: true, name: true, email: true, phone: true } },
  reviewedBy: { select: { id: true, name: true } },
  cancelledBy: { select: { id: true, name: true } },
} as const;

function yyyymmdd(d = new Date()) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

async function nextOrderNo(tx: { materialOrder: { count: Function } }, tenantId: string) {
  const day = yyyymmdd();
  const prefix = `ORD-${day}-`;
  const count = await tx.materialOrder.count({
    where: { tenantId, orderNo: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(4, '0')}`;
}

async function nextShippingLabelNo(tx: { materialOrder: { count: Function } }, tenantId: string) {
  const day = yyyymmdd();
  const prefix = `SL-${day}-`;
  const count = await tx.materialOrder.count({
    where: { tenantId, shippingLabelNo: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(4, '0')}`;
}

function deriveGrade(
  classes: { title: string; batch?: { name: string } | null }[]
): string {
  const batches = [...new Set(classes.map((c) => c.batch?.name).filter(Boolean) as string[])];
  if (batches.length) return batches.join(', ');
  return [...new Set(classes.map((c) => c.title))].join(', ');
}

export function serializeMaterialOrder(order: any) {
  const materials = (order.items ?? []).map((i: any) => i.materialTitle);
  const classes = [...new Set((order.items ?? []).map((i: any) => i.classTitle))];
  return {
    id: order.id,
    orderNo: order.orderNo,
    shippingLabelNo: order.shippingLabelNo ?? null,
    status: order.status as MaterialOrderStatus,
    recipientName: order.recipientName,
    email: order.email,
    phone: order.phone,
    address: order.address,
    grade: order.grade,
    remarks: order.remarks ?? null,
    slipFileId: order.slipFileId,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    statusChangedAt: order.statusChangedAt,
    reviewedAt: order.reviewedAt ?? null,
    reviewedBy: order.reviewedBy ?? null,
    cancelledAt: order.cancelledAt ?? null,
    cancelledBy: order.cancelledBy ?? null,
    cancelNote: order.cancelNote ?? null,
    materials,
    relatedClasses: classes,
    items: (order.items ?? []).map((i: any) => ({
      id: i.id,
      paymentId: i.paymentId,
      materialId: i.materialId,
      classId: i.classId,
      materialTitle: i.materialTitle,
      classTitle: i.classTitle,
      amount: Number(i.amount),
      teacherId: i.class?.teacherId ?? null,
      teacher: i.class?.teacher
        ? {
            id: i.class.teacher.id,
            name: i.class.teacher.name,
            phone: i.class.teacher.phone ?? null,
            address: i.class.teacher.address ?? null,
            shippingLabelPhotoFileId: i.class.teacher.shippingLabelPhotoFileId ?? null,
            shippingLabelPhotoOnly: Boolean(i.class.teacher.shippingLabelPhotoOnly),
          }
        : null,
    })),
    student: order.student
      ? {
          id: order.student.id,
          name: order.student.name,
          email: order.student.email,
          phone: order.student.phone ?? null,
        }
      : null,
  };
}

export type CreateOrderFromPaymentsInput = {
  tenantId: string;
  studentId: string;
  slipFileId: string;
  payments: {
    id: string;
    materialId: string;
    amount: Prisma.Decimal | number;
    material: { id: string; title: string; classId: string };
    enrollment: {
      class: { id: string; title: string; batch?: { name: string } | null };
    };
  }[];
  recipient: {
    name: string;
    email: string;
    phone: string;
    address: string;
  };
};

/** Create one MaterialOrder for a batch of material payments sharing a slip. */
export async function createMaterialOrderFromPayments(input: CreateOrderFromPaymentsInput) {
  const { tenantId, studentId, slipFileId, payments, recipient } = input;
  if (!payments.length) throw badRequest('No payments to create an order from');
  if (!recipient.phone?.trim() || !recipient.address?.trim()) {
    throw badRequest('Phone and address are required for material orders');
  }

  const existing = await prisma.materialOrderItem.findFirst({
    where: { paymentId: { in: payments.map((p) => p.id) } },
    select: { orderId: true },
  });
  if (existing) {
    return prisma.materialOrder.findFirstOrThrow({
      where: { id: existing.orderId },
      include: MATERIAL_ORDER_INCLUDE,
    });
  }

  const grade = deriveGrade(payments.map((p) => p.enrollment.class));

  return prisma.$transaction(async (tx) => {
    const orderNo = await nextOrderNo(tx, tenantId);
    const order = await tx.materialOrder.create({
      data: {
        tenantId,
        studentId,
        orderNo,
        status: 'approval_pending',
        recipientName: recipient.name.trim(),
        email: recipient.email.trim(),
        phone: recipient.phone.trim(),
        address: recipient.address.trim(),
        grade,
        slipFileId,
        items: {
          create: payments.map((p) => ({
            paymentId: p.id,
            materialId: p.materialId,
            classId: p.enrollment.class.id,
            materialTitle: p.material.title,
            classTitle: p.enrollment.class.title,
            amount: p.amount,
          })),
        },
      },
      include: MATERIAL_ORDER_INCLUDE,
    });
    return order;
  });
}

export async function syncMaterialOrderFromPaymentReview(
  slipFileId: string,
  studentId: string,
  approve: boolean,
  reviewerId: string,
  note?: string
) {
  const order = await prisma.materialOrder.findFirst({
    where: {
      slipFileId,
      studentId,
      status: 'approval_pending',
    },
  });
  if (!order) return null;

  return prisma.materialOrder.update({
    where: { id: order.id },
    data: {
      status: approve ? 'active' : 'rejected',
      reviewedById: reviewerId,
      reviewedAt: new Date(),
      statusChangedAt: new Date(),
      remarks: note ? [order.remarks, note].filter(Boolean).join('\n') : order.remarks,
    },
    include: MATERIAL_ORDER_INCLUDE,
  });
}

const FULFILLMENT_TRANSITIONS: Record<string, MaterialOrderStatus[]> = {
  active: ['processing', 'cancelled'],
  processing: ['delivered', 'cancelled'],
};

export function assertFulfillmentTransition(from: MaterialOrderStatus, to: MaterialOrderStatus) {
  const allowed = FULFILLMENT_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw badRequest(`Cannot change status from ${from} to ${to}`);
  }
}

export async function applyOrderStatus(
  orderId: string,
  nextStatus: MaterialOrderStatus,
  actorId: string,
  cancelNote?: string
) {
  const order = await prisma.materialOrder.findFirst({
    where: { id: orderId },
    include: MATERIAL_ORDER_INCLUDE,
  });
  if (!order) throw notFound('Order not found');

  assertFulfillmentTransition(order.status, nextStatus);

  const data: Prisma.MaterialOrderUpdateInput = {
    status: nextStatus,
    statusChangedAt: new Date(),
  };

  if (nextStatus === 'processing' && !order.shippingLabelNo) {
    const label = await prisma.$transaction((tx) => nextShippingLabelNo(tx, order.tenantId));
    data.shippingLabelNo = label;
  }

  if (nextStatus === 'cancelled') {
    data.cancelledAt = new Date();
    data.cancelledBy = { connect: { id: actorId } };
    data.cancelNote = cancelNote?.trim() || null;
  }

  return prisma.materialOrder.update({
    where: { id: order.id },
    data,
    include: MATERIAL_ORDER_INCLUDE,
  });
}

/** Assign shipping label numbers to processing orders that are missing them. */
export async function ensureShippingLabels(orderIds: string[]) {
  const updated: Awaited<ReturnType<typeof serializeMaterialOrder>>[] = [];

  for (const id of orderIds) {
    const order = await prisma.materialOrder.findFirst({
      where: { id },
      include: MATERIAL_ORDER_INCLUDE,
    });
    if (!order) continue;
    if (order.shippingLabelNo) {
      updated.push(serializeMaterialOrder(order));
      continue;
    }
    if (order.status !== 'processing' && order.status !== 'active') continue;

    const label = await prisma.$transaction((tx) => nextShippingLabelNo(tx, order.tenantId));
    const next = await prisma.materialOrder.update({
      where: { id: order.id },
      data: {
        shippingLabelNo: label,
        ...(order.status === 'active'
          ? { status: 'processing' as const, statusChangedAt: new Date() }
          : {}),
      },
      include: MATERIAL_ORDER_INCLUDE,
    });
    updated.push(serializeMaterialOrder(next));
  }

  return updated;
}

export function ensureCanAccessOrder(
  reqUser: { role: string; sub: string },
  order: { items: { class?: { teacherId?: string } | null; teacherId?: string | null }[] }
) {
  if (reqUser.role === 'admin' || reqUser.role === 'superadmin') return;
  const owns = order.items.some(
    (i) => (i.class?.teacherId ?? i.teacherId) === reqUser.sub
  );
  if (!owns) throw forbidden('You can only manage orders for your own classes');
}

export function teacherScopeWhere(teacherId: string): Prisma.MaterialOrderWhereInput {
  return {
    items: { some: { class: { teacherId } } },
  };
}

export function buildOrderListWhere(opts: {
  tenantId: string;
  role: string;
  userId: string;
  status?: string | null;
  q?: string | null;
  date?: string | null;
  from?: string | null;
  to?: string | null;
}): Prisma.MaterialOrderWhereInput {
  const where: Prisma.MaterialOrderWhereInput = { tenantId: opts.tenantId };

  if (opts.role === 'teacher') {
    Object.assign(where, teacherScopeWhere(opts.userId));
  }

  if (opts.status && opts.status !== 'all') {
    where.status = opts.status as MaterialOrderStatus;
  }

  if (opts.q?.trim()) {
    const q = opts.q.trim();
    where.OR = [
      { orderNo: { contains: q, mode: 'insensitive' } },
      { shippingLabelNo: { contains: q, mode: 'insensitive' } },
      { recipientName: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
      { address: { contains: q, mode: 'insensitive' } },
    ];
  }

  if (opts.date) {
    const day = new Date(opts.date);
    if (!Number.isNaN(day.getTime())) {
      const start = new Date(day);
      start.setHours(0, 0, 0, 0);
      const end = new Date(day);
      end.setHours(23, 59, 59, 999);
      where.createdAt = { gte: start, lte: end };
    }
  } else if (opts.from || opts.to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (opts.from) {
      const start = new Date(opts.from);
      start.setHours(0, 0, 0, 0);
      if (!Number.isNaN(start.getTime())) createdAt.gte = start;
    }
    if (opts.to) {
      const end = new Date(opts.to);
      end.setHours(23, 59, 59, 999);
      if (!Number.isNaN(end.getTime())) createdAt.lte = end;
    }
    if (Object.keys(createdAt).length) where.createdAt = createdAt;
  }

  return where;
}

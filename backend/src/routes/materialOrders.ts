import { Router } from 'express';
import { z } from 'zod';
import type { MaterialOrderStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole } from '../middleware/auth';
import { badRequest, notFound } from '../utils/httpError';
import { storage } from '../services/storage';
import { reviewPaymentSchema } from '../validation/schemas';
import {
  MATERIAL_ORDER_INCLUDE,
  applyOrderStatus,
  assertFulfillmentTransition,
  buildOrderListWhere,
  ensureCanAccessOrder,
  ensureShippingLabels,
  serializeMaterialOrder,
  syncMaterialOrderFromPaymentReview,
} from '../services/materialOrders';
import { createNotification } from '../services/notifications';

const router = Router({ mergeParams: true });

const statusUpdateSchema = z.object({
  status: z.enum(['processing', 'delivered', 'cancelled']),
  cancelNote: z.string().max(500).optional(),
});

const bulkStatusSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  status: z.enum(['processing', 'delivered', 'cancelled']),
  cancelNote: z.string().max(500).optional(),
});

const remarksSchema = z.object({
  remarks: z.string().max(2000).optional().nullable(),
});

function parseListQuery(query: Record<string, unknown>) {
  return {
    status: typeof query.status === 'string' ? query.status : null,
    q: typeof query.q === 'string' ? query.q : null,
    date: typeof query.date === 'string' ? query.date : null,
    from: typeof query.from === 'string' ? query.from : null,
    to: typeof query.to === 'string' ? query.to : null,
  };
}

async function loadScopedOrder(orderId: string, req: { user: { role: string; sub: string } }) {
  const order = await prisma.materialOrder.findFirst({
    where: { id: orderId },
    include: MATERIAL_ORDER_INCLUDE,
  });
  if (!order) throw notFound('Order not found');
  ensureCanAccessOrder(req.user, order);
  return order;
}

/** Approve linked material payments (same sibling-slip batch) and activate order. */
async function approvePaymentsForOrder(orderId: string, reviewerId: string, note?: string) {
  const order = await prisma.materialOrder.findFirst({
    where: { id: orderId },
    include: { items: { select: { paymentId: true } } },
  });
  if (!order) throw notFound('Order not found');
  if (order.status !== 'approval_pending') {
    throw badRequest('Only approval-pending orders can be approved');
  }

  const paymentIds = order.items.map((i) => i.paymentId);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.payment.updateMany({
      where: { id: { in: paymentIds }, status: 'pending' },
      data: {
        status: 'approved',
        reviewedById: reviewerId,
        reviewedAt: now,
        note,
      },
    });

    await tx.materialOrder.update({
      where: { id: order.id },
      data: {
        status: 'active',
        reviewedById: reviewerId,
        reviewedAt: now,
        statusChangedAt: now,
        remarks: note ? [order.remarks, note].filter(Boolean).join('\n') : order.remarks,
      },
    });
  });

  await createNotification({
    tenantId: order.tenantId,
    userId: order.studentId,
    type: 'payment_approved',
    title: 'Payment approved',
    body: `Your material order ${order.orderNo} was approved.`,
    link: '/payments?section=materials',
  });

  return prisma.materialOrder.findFirstOrThrow({
    where: { id: order.id },
    include: MATERIAL_ORDER_INCLUDE,
  });
}

async function rejectPaymentsForOrder(orderId: string, reviewerId: string, note?: string) {
  const order = await prisma.materialOrder.findFirst({
    where: { id: orderId },
    include: { items: { select: { paymentId: true } } },
  });
  if (!order) throw notFound('Order not found');
  if (order.status !== 'approval_pending') {
    throw badRequest('Only approval-pending orders can be rejected');
  }

  const paymentIds = order.items.map((i) => i.paymentId);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.payment.updateMany({
      where: { id: { in: paymentIds }, status: 'pending' },
      data: {
        status: 'rejected',
        reviewedById: reviewerId,
        reviewedAt: now,
        note,
      },
    });

    await tx.materialOrder.update({
      where: { id: order.id },
      data: {
        status: 'rejected',
        reviewedById: reviewerId,
        reviewedAt: now,
        statusChangedAt: now,
        remarks: note ? [order.remarks, note].filter(Boolean).join('\n') : order.remarks,
      },
    });
  });

  await createNotification({
    tenantId: order.tenantId,
    userId: order.studentId,
    type: 'payment_rejected',
    title: 'Payment rejected',
    body: `Your material order ${order.orderNo} was rejected.${note ? ` Note: ${note}` : ''}`,
    link: '/payments?section=materials',
  });

  return prisma.materialOrder.findFirstOrThrow({
    where: { id: order.id },
    include: MATERIAL_ORDER_INCLUDE,
  });
}

router.get(
  '/material-orders',
  authenticate,
  requireRole('admin', 'teacher', 'superadmin'),
  asyncHandler(async (req, res) => {
    const q = parseListQuery(req.query as Record<string, unknown>);
    const where = buildOrderListWhere({
      tenantId: req.tenant!.id,
      role: req.user!.role,
      userId: req.user!.sub,
      ...q,
    });

    const orders = await prisma.materialOrder.findMany({
      where,
      include: MATERIAL_ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    res.json({ orders: orders.map(serializeMaterialOrder) });
  })
);

router.get(
  '/material-orders/export',
  authenticate,
  requireRole('admin', 'teacher', 'superadmin'),
  asyncHandler(async (req, res) => {
    const q = parseListQuery(req.query as Record<string, unknown>);
    const where = buildOrderListWhere({
      tenantId: req.tenant!.id,
      role: req.user!.role,
      userId: req.user!.sub,
      ...q,
    });

    const orders = await prisma.materialOrder.findMany({
      where,
      include: MATERIAL_ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });

    const header = [
      'Shipping label no',
      'Order no',
      'Name',
      'Grade',
      'Address',
      'Telephone no',
      'Ordered materials',
      'Related classes',
      'Email',
      'Remarks',
      'Status',
    ];
    const rows = orders.map((o) => {
      const s = serializeMaterialOrder(o);
      return [
        s.shippingLabelNo ?? '',
        s.orderNo,
        s.recipientName,
        s.grade,
        s.address,
        s.phone,
        s.materials.join('; '),
        s.relatedClasses.join('; '),
        s.email,
        s.remarks ?? '',
        s.status,
      ];
    });

    const csv = [header, ...rows]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="material-orders.csv"');
    res.send('\uFEFF' + csv);
  })
);

router.post(
  '/material-orders/bulk-status',
  authenticate,
  requireRole('admin', 'teacher', 'superadmin'),
  asyncHandler(async (req, res) => {
    const data = bulkStatusSchema.parse(req.body);
    const results: { id: string; ok: boolean; error?: string }[] = [];

    for (const id of data.ids) {
      try {
        const order = await loadScopedOrder(id, req as any);
        assertFulfillmentTransition(order.status, data.status as MaterialOrderStatus);
        await applyOrderStatus(id, data.status as MaterialOrderStatus, req.user!.sub, data.cancelNote);
        results.push({ id, ok: true });
      } catch (err: any) {
        results.push({ id, ok: false, error: err?.message ?? 'Failed' });
      }
    }

    res.json({ results });
  })
);

router.post(
  '/material-orders/ensure-labels',
  authenticate,
  requireRole('admin', 'teacher', 'superadmin'),
  asyncHandler(async (req, res) => {
    const data = z.object({ ids: z.array(z.string().min(1)).min(1).max(200) }).parse(req.body);
    const allowed: string[] = [];
    for (const id of data.ids) {
      try {
        await loadScopedOrder(id, req as any);
        allowed.push(id);
      } catch {
        /* skip unauthorized */
      }
    }
    const orders = await ensureShippingLabels(allowed);
    res.json({ orders });
  })
);

router.get(
  '/material-orders/:id/slip',
  authenticate,
  requireRole('admin', 'teacher', 'superadmin'),
  asyncHandler(async (req, res) => {
    const order = await loadScopedOrder(req.params.id, req as any);
    const file = await prisma.file.findFirst({ where: { id: order.slipFileId } });
    if (!file) throw notFound('Slip not found');
    res.setHeader('Content-Type', file.mimeType);
    storage.createReadStream(file.storageKey).pipe(res);
  })
);

router.post(
  '/material-orders/:id/approve',
  authenticate,
  requireRole('admin', 'teacher', 'superadmin'),
  asyncHandler(async (req, res) => {
    const data = reviewPaymentSchema.parse(req.body ?? {});
    const order = await loadScopedOrder(req.params.id, req as any);
    const updated = await approvePaymentsForOrder(order.id, req.user!.sub, data.note);
    res.json({ order: serializeMaterialOrder(updated) });
  })
);

router.post(
  '/material-orders/:id/reject',
  authenticate,
  requireRole('admin', 'teacher', 'superadmin'),
  asyncHandler(async (req, res) => {
    const data = reviewPaymentSchema.parse(req.body ?? {});
    const order = await loadScopedOrder(req.params.id, req as any);
    const updated = await rejectPaymentsForOrder(order.id, req.user!.sub, data.note);
    res.json({ order: serializeMaterialOrder(updated) });
  })
);

router.patch(
  '/material-orders/:id/status',
  authenticate,
  requireRole('admin', 'teacher', 'superadmin'),
  asyncHandler(async (req, res) => {
    const data = statusUpdateSchema.parse(req.body);
    await loadScopedOrder(req.params.id, req as any);
    const updated = await applyOrderStatus(
      req.params.id,
      data.status as MaterialOrderStatus,
      req.user!.sub,
      data.cancelNote
    );
    res.json({ order: serializeMaterialOrder(updated) });
  })
);

router.patch(
  '/material-orders/:id',
  authenticate,
  requireRole('admin', 'teacher', 'superadmin'),
  asyncHandler(async (req, res) => {
    const data = remarksSchema.parse(req.body);
    await loadScopedOrder(req.params.id, req as any);
    const updated = await prisma.materialOrder.update({
      where: { id: req.params.id },
      data: { remarks: data.remarks ?? null },
      include: MATERIAL_ORDER_INCLUDE,
    });
    res.json({ order: serializeMaterialOrder(updated) });
  })
);

/** Staff: stream a teacher's shipping-label photo for printing. */
router.get(
  '/material-orders/teachers/:teacherId/shipping-label-photo',
  authenticate,
  requireRole('admin', 'teacher', 'superadmin'),
  asyncHandler(async (req, res) => {
    const teacher = await prisma.user.findFirst({
      where: { id: req.params.teacherId, role: 'teacher' },
      select: { id: true, shippingLabelPhotoFileId: true },
    });
    if (!teacher?.shippingLabelPhotoFileId) throw notFound('Shipping label photo not found');

    // Teachers may only fetch their own photo via this staff path.
    if (req.user!.role === 'teacher' && req.user!.sub !== teacher.id) {
      throw notFound('Shipping label photo not found');
    }

    const file = await prisma.file.findFirst({
      where: { id: teacher.shippingLabelPhotoFileId, kind: 'shipping_label' },
    });
    if (!file) throw notFound('Shipping label photo not found');

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', `inline; filename="${file.originalName.replace(/"/g, '')}"`);
    storage.createReadStream(file.storageKey).pipe(res);
  })
);

export { syncMaterialOrderFromPaymentReview };
export default router;

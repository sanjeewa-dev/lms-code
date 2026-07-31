import crypto from 'crypto';
import { basePrisma } from '../lib/prisma';
import { createNotification } from './notifications';
import { currentBillingMonth } from './access';
import { badRequest, notFound } from '../utils/httpError';
import { runWithContext } from '../lib/tenantContext';

/** PayHere MD5 signature verification (sandbox + live). */
export function verifyPayHereSignature(opts: {
  merchantId: string;
  orderId: string;
  amount: string;
  currency: string;
  statusCode: string;
  md5sig: string;
  merchantSecret: string;
}) {
  const secretHash = crypto.createHash('md5').update(opts.merchantSecret).digest('hex').toUpperCase();
  const local = crypto
    .createHash('md5')
    .update(opts.merchantId + opts.orderId + opts.amount + opts.currency + opts.statusCode + secretHash)
    .digest('hex')
    .toUpperCase();
  return local === opts.md5sig.toUpperCase();
}

/**
 * Process PayHere IPN notify payload. status_code 2 = success.
 * custom_1 = enrollmentId, custom_2 = forMonth
 */
export async function processPayHereNotify(tenantId: string, body: Record<string, string>) {
  const tenant = await basePrisma.tenant.findFirst({ where: { id: tenantId } });
  if (!tenant?.payhereEnabled || !tenant.payhereMerchantId) {
    throw badRequest('PayHere is not enabled for this institute');
  }
  if (!tenant.payhereMerchantSecret) {
    throw badRequest('PayHere merchant secret is not configured');
  }

  const merchantId = body.merchant_id;
  const orderId = body.order_id;
  const amount = body.payhere_amount;
  const currency = body.payhere_currency;
  const statusCode = body.status_code;
  const md5sig = body.md5sig;

  if (!merchantId || !orderId || !amount || !currency || !statusCode || !md5sig) {
    throw badRequest('Invalid PayHere notify payload');
  }

  if (merchantId !== tenant.payhereMerchantId) {
    throw badRequest('Merchant ID mismatch');
  }

  const valid = verifyPayHereSignature({
    merchantId,
    orderId,
    amount,
    currency,
    statusCode,
    md5sig,
    merchantSecret: tenant.payhereMerchantSecret,
  });
  if (!valid) throw badRequest('Invalid PayHere signature');

  // 2 = success
  if (statusCode !== '2') {
    return { ok: true, ignored: true, statusCode };
  }

  const enrollmentId = body.custom_1;
  const forMonth = body.custom_2 || currentBillingMonth();
  if (!enrollmentId) throw badRequest('Missing enrollment reference');

  const enrollment = await basePrisma.enrollment.findFirst({
    where: { id: enrollmentId, tenantId },
    include: { class: { select: { title: true, price: true } } },
  });
  if (!enrollment) throw notFound('Enrollment not found');

  const existing = await basePrisma.payment.findFirst({
    where: {
      enrollmentId,
      forMonth,
      status: 'approved',
    },
  });
  if (existing) return { ok: true, paymentId: existing.id, alreadyApproved: true };

  // Prefer a pending placeholder if student started checkout after uploading nothing;
  // otherwise create an approved online payment (no slip file — use a stub file record).
  let pending = await basePrisma.payment.findFirst({
    where: { enrollmentId, forMonth, status: 'pending' },
  });

  const paymentType = enrollment.status === 'active' ? 'monthly' : 'enrollment';
  const paidAmount = Number(amount);

  if (pending) {
    pending = await basePrisma.payment.update({
      where: { id: pending.id },
      data: {
        status: 'approved',
        amount: paidAmount,
        reviewedAt: new Date(),
        note: `PayHere order ${orderId}`,
      },
    });
  } else {
    // Create a minimal slip file placeholder so Payment.slipFileId FK is satisfied.
    const admin = await basePrisma.user.findFirst({
      where: { tenantId, role: { in: ['admin', 'teacher'] } },
      select: { id: true },
    });
    const ownerId = admin?.id ?? enrollment.studentId;
    const slip = await basePrisma.file.create({
      data: {
        tenantId,
        ownerId,
        storageKey: `payhere/${orderId}.txt`,
        originalName: `payhere-${orderId}.txt`,
        mimeType: 'text/plain',
        size: 0,
        kind: 'slip',
      },
    });
    pending = await basePrisma.payment.create({
      data: {
        tenantId,
        enrollmentId,
        amount: paidAmount,
        slipFileId: slip.id,
        paymentType,
        forMonth,
        status: 'approved',
        reviewedAt: new Date(),
        note: `PayHere order ${orderId}`,
      },
    });
  }

  if (paymentType === 'enrollment' && enrollment.status !== 'active') {
    await basePrisma.enrollment.update({
      where: { id: enrollment.id },
      data: { status: 'active' },
    });
  }

  await runWithContext({ tenantId }, async () => {
    await createNotification({
      tenantId,
      userId: enrollment.studentId,
      type: 'payment_approved',
      title: 'Online payment received',
      body: `PayHere payment for ${enrollment.class.title} (${forMonth}) was approved.`,
      link: '/payments',
    });
  });

  return { ok: true, paymentId: pending.id };
}

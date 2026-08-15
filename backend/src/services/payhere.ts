import crypto from 'crypto';
import { basePrisma } from '../lib/prisma';
import { createNotification } from './notifications';
import { currentBillingMonth } from './access';
import { badRequest, notFound } from '../utils/httpError';
import { runWithContext } from '../lib/tenantContext';
import { timingSafeEqualString } from '../utils/cryptoTokens';

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
  const expected = opts.md5sig.toUpperCase();
  return timingSafeEqualString(local, expected);
}

function amountsEqual(a: string | number, b: string | number): boolean {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  return Math.abs(na - nb) < 0.005;
}

/**
 * Process PayHere IPN notify payload. status_code 2 = success.
 * Prefers server-side pending payment bound by order_id; amount must match class price.
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
  const currency = body.currency || body.payhere_currency;
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

  if (statusCode !== '2') {
    return { ok: true, ignored: true, statusCode };
  }

  let pending = await basePrisma.payment.findFirst({
    where: { tenantId, orderId },
    include: { enrollment: { include: { class: { select: { title: true, price: true } } } } },
  });

  // Legacy fallback: locate by custom fields only if order was never bound (should be rare).
  if (!pending) {
    const enrollmentId = body.custom_1;
    const forMonth = body.custom_2 || currentBillingMonth();
    if (!enrollmentId) throw badRequest('Missing enrollment reference');
    pending = await basePrisma.payment.findFirst({
      where: { tenantId, enrollmentId, forMonth, status: 'pending' },
      include: { enrollment: { include: { class: { select: { title: true, price: true } } } } },
    });
    if (pending) {
      pending = await basePrisma.payment.update({
        where: { id: pending.id },
        data: { orderId },
        include: { enrollment: { include: { class: { select: { title: true, price: true } } } } },
      });
    }
  }

  if (!pending) throw notFound('Payment order not found');
  if (pending.status === 'approved') {
    return { ok: true, paymentId: pending.id, alreadyApproved: true };
  }
  if (pending.status !== 'pending') {
    throw badRequest('Payment is not awaiting approval');
  }

  // The payment amount was calculated and bound during checkout; it already
  // includes any approved fee waiver.
  const expectedAmount = Number(pending.amount).toFixed(2);
  if (!amountsEqual(amount, expectedAmount)) {
    throw badRequest('Paid amount does not match the payment order');
  }

  const enrollment = pending.enrollment;
  const forMonth = pending.forMonth;
  const paymentType = pending.paymentType;

  const approved = await basePrisma.payment.update({
    where: { id: pending.id },
    data: {
      status: 'approved',
      amount: expectedAmount,
      reviewedAt: new Date(),
      note: `PayHere order ${orderId}`,
      orderId,
    },
  });

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

  return { ok: true, paymentId: approved.id };
}

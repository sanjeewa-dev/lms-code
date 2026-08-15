type Money = number | string | { toString(): string };

/** Caps a waiver at the class price so the net fee cannot become negative. */
export function clampFeeWaiver(price: Money, feeWaiverAmount: Money = 0): number {
  const normalizedPrice = Math.max(0, Number(price) || 0);
  const normalizedWaiver = Math.max(0, Number(feeWaiverAmount) || 0);
  return Math.min(normalizedWaiver, normalizedPrice);
}

/** Calculates a non-negative class fee after fee assistance is applied. */
export function netClassFee(price: Money, feeWaiverAmount: Money = 0): number {
  const normalizedPrice = Math.max(0, Number(price) || 0);
  return Math.max(0, normalizedPrice - clampFeeWaiver(normalizedPrice, feeWaiverAmount));
}

/**
 * Fully free or waived enrollments are active. A positive balance remains
 * pending until the enrollment payment is approved.
 */
export function enrollmentStatusForNetFee(
  price: Money = 0,
  feeWaiverAmount: Money = 0
): 'active' | 'pending' {
  return netClassFee(price, feeWaiverAmount) === 0 ? 'active' : 'pending';
}

import { describe, expect, it } from 'vitest';

/** Mirrors payment-create rules: pending enrollments need enrollment slips. */
function paymentTypeForEnrollment(status: string): 'monthly' | 'enrollment' {
  return status === 'active' ? 'monthly' : 'enrollment';
}

describe('payment type selection', () => {
  it('uses enrollment slips for pending enrollments so approval can activate access', () => {
    expect(paymentTypeForEnrollment('pending')).toBe('enrollment');
    expect(paymentTypeForEnrollment('rejected')).toBe('enrollment');
    expect(paymentTypeForEnrollment('active')).toBe('monthly');
  });
});

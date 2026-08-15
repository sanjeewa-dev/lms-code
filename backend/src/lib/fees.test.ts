import { describe, expect, it } from 'vitest';
import { clampFeeWaiver, enrollmentStatusForNetFee, netClassFee } from './fees';

describe('fee helpers', () => {
  it('clamps waivers so net fee never goes negative', () => {
    expect(clampFeeWaiver(1000, 250)).toBe(250);
    expect(clampFeeWaiver(1000, 5000)).toBe(1000);
    expect(clampFeeWaiver(1000, -10)).toBe(0);
    expect(netClassFee(1000, 250)).toBe(750);
    expect(netClassFee(1000, 5000)).toBe(0);
    expect(netClassFee('500.50', '100.25')).toBe(400.25);
  });

  it('activates only zero-net-fee enrollments', () => {
    expect(enrollmentStatusForNetFee(0, 0)).toBe('active');
    expect(enrollmentStatusForNetFee(1000, 1000)).toBe('active');
    expect(enrollmentStatusForNetFee(1000, 250)).toBe('pending');
    expect(enrollmentStatusForNetFee(1000, 0)).toBe('pending');
  });
});

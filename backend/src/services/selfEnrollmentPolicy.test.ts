import { describe, expect, it } from 'vitest';
import {
  canAnonymousRegisterForClass,
  ruleAllows,
  serializeSelfEnrollmentPolicy,
  type SelfEnrollmentConfig,
} from './selfEnrollmentPolicy';

const emptyContext = { classIds: new Set<string>(), batchIds: new Set<string>() };

describe('self-enrollment policy', () => {
  it('serializes tenant policy relations', () => {
    const serialized = serializeSelfEnrollmentPolicy({
      selfEnrollmentEnabled: true,
      selfEnrollmentScope: 'selected_classes',
      selfEnrollmentRules: [
        {
          targetClassId: 'c1',
          audience: 'enrolled_in_classes',
          sourceClasses: [{ classId: 'src1' }],
          sourceBatches: [],
        },
      ],
    });
    expect(serialized).toEqual({
      enabled: true,
      scope: 'selected_classes',
      rules: [
        {
          targetClassId: 'c1',
          audience: 'enrolled_in_classes',
          sourceClassIds: ['src1'],
          sourceBatchIds: [],
        },
      ],
    });
  });

  it('evaluates anonymous registration and student rule matrix', () => {
    const disabled: SelfEnrollmentConfig = {
      enabled: false,
      scope: 'all_classes',
      rules: [],
    };
    expect(canAnonymousRegisterForClass(disabled, 'c1')).toBe(false);

    const allClasses: SelfEnrollmentConfig = {
      enabled: true,
      scope: 'all_classes',
      rules: [],
    };
    expect(canAnonymousRegisterForClass(allClasses, 'c1')).toBe(true);
    expect(ruleAllows(allClasses, 'c1', emptyContext)).toBe(true);

    const selected: SelfEnrollmentConfig = {
      enabled: true,
      scope: 'selected_classes',
      rules: [
        {
          targetClassId: 'open',
          audience: 'all_students',
          sourceClassIds: [],
          sourceBatchIds: [],
        },
        {
          targetClassId: 'from-class',
          audience: 'enrolled_in_classes',
          sourceClassIds: ['src'],
          sourceBatchIds: [],
        },
        {
          targetClassId: 'from-batch',
          audience: 'batches',
          sourceClassIds: [],
          sourceBatchIds: ['b1'],
        },
      ],
    };

    expect(canAnonymousRegisterForClass(selected, 'open')).toBe(true);
    expect(canAnonymousRegisterForClass(selected, 'from-class')).toBe(false);
    expect(ruleAllows(selected, 'from-class', { classIds: new Set(['src']), batchIds: new Set() })).toBe(true);
    expect(ruleAllows(selected, 'from-class', emptyContext)).toBe(false);
    expect(ruleAllows(selected, 'from-batch', { classIds: new Set(), batchIds: new Set(['b1']) })).toBe(true);
    expect(ruleAllows(selected, 'missing', emptyContext)).toBe(false);
  });
});

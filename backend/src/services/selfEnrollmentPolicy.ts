import type { SelfEnrollmentAudience, SelfEnrollmentScope } from '@prisma/client';
import { basePrisma } from '../lib/prisma';

export type SelfEnrollmentConfig = {
  enabled: boolean;
  scope: SelfEnrollmentScope;
  rules: {
    targetClassId: string;
    audience: SelfEnrollmentAudience;
    sourceClassIds: string[];
    sourceBatchIds: string[];
  }[];
};

const policyInclude = {
  selfEnrollmentRules: {
    include: {
      sourceClasses: { select: { classId: true } },
      sourceBatches: { select: { batchId: true } },
    },
  },
} as const;

export function serializeSelfEnrollmentPolicy(tenant: {
  selfEnrollmentEnabled: boolean;
  selfEnrollmentScope: SelfEnrollmentScope;
  selfEnrollmentRules: {
    targetClassId: string;
    audience: SelfEnrollmentAudience;
    sourceClasses: { classId: string }[];
    sourceBatches: { batchId: string }[];
  }[];
}): SelfEnrollmentConfig {
  return {
    enabled: tenant.selfEnrollmentEnabled,
    scope: tenant.selfEnrollmentScope,
    rules: tenant.selfEnrollmentRules.map((rule) => ({
      targetClassId: rule.targetClassId,
      audience: rule.audience,
      sourceClassIds: rule.sourceClasses.map((source) => source.classId),
      sourceBatchIds: rule.sourceBatches.map((source) => source.batchId),
    })),
  };
}

export async function loadSelfEnrollmentPolicy(tenantId: string) {
  const tenant = await basePrisma.tenant.findFirst({ where: { id: tenantId }, include: policyInclude });
  return tenant ? serializeSelfEnrollmentPolicy(tenant) : null;
}

async function activeEnrollmentContext(studentId: string) {
  const enrollments = await basePrisma.enrollment.findMany({
    where: { studentId, status: 'active' },
    select: { classId: true, class: { select: { batchId: true } } },
  });
  return {
    classIds: new Set(enrollments.map((enrollment) => enrollment.classId)),
    batchIds: new Set(
      enrollments.map((enrollment) => enrollment.class.batchId).filter((id): id is string => Boolean(id))
    ),
  };
}

/** Pure policy check used by catalog/join flows (exported for unit tests). */
export function ruleAllows(
  policy: SelfEnrollmentConfig,
  classId: string,
  context: { classIds: Set<string>; batchIds: Set<string> }
) {
  if (!policy.enabled) return false;
  if (policy.scope === 'all_classes') return true;
  const rule = policy.rules.find((candidate) => candidate.targetClassId === classId);
  if (!rule) return false;
  if (rule.audience === 'all_students') return true;
  if (rule.audience === 'batches') return rule.sourceBatchIds.some((id) => context.batchIds.has(id));
  return rule.sourceClassIds.some((id) => context.classIds.has(id));
}

export function canAnonymousRegisterForClass(policy: SelfEnrollmentConfig, classId: string) {
  if (!policy.enabled) return false;
  if (policy.scope === 'all_classes') return true;
  return policy.rules.find((rule) => rule.targetClassId === classId)?.audience === 'all_students';
}

export async function canStudentSelfEnroll(opts: {
  tenantId: string; studentId: string; classId: string; policy?: SelfEnrollmentConfig | null;
}) {
  const policy = opts.policy ?? await loadSelfEnrollmentPolicy(opts.tenantId);
  if (!policy?.enabled) return false;
  const [klass, existing, context] = await Promise.all([
    basePrisma.class.findFirst({
      where: { id: opts.classId, tenantId: opts.tenantId, isPublished: true }, select: { id: true },
    }),
    basePrisma.enrollment.findFirst({
      where: { classId: opts.classId, studentId: opts.studentId }, select: { id: true },
    }),
    activeEnrollmentContext(opts.studentId),
  ]);
  return Boolean(klass && !existing && ruleAllows(policy, opts.classId, context));
}

export async function listCatalogClassIds(opts: {
  tenantId: string; studentId: string; policy?: SelfEnrollmentConfig | null;
}) {
  const policy = opts.policy ?? await loadSelfEnrollmentPolicy(opts.tenantId);
  if (!policy?.enabled) return [];
  const [context, enrolled, published] = await Promise.all([
    activeEnrollmentContext(opts.studentId),
    basePrisma.enrollment.findMany({ where: { studentId: opts.studentId }, select: { classId: true } }),
    basePrisma.class.findMany({ where: { tenantId: opts.tenantId, isPublished: true }, select: { id: true } }),
  ]);
  const enrolledIds = new Set(enrolled.map((enrollment) => enrollment.classId));
  return published.map((klass) => klass.id)
    .filter((id) => !enrolledIds.has(id) && ruleAllows(policy, id, context));
}

export async function replaceSelfEnrollmentPolicy(tenantId: string, input: SelfEnrollmentConfig) {
  await basePrisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: tenantId },
      data: { selfEnrollmentEnabled: input.enabled, selfEnrollmentScope: input.scope },
    });
    await tx.selfEnrollmentRule.deleteMany({ where: { tenantId } });
    if (!input.enabled || input.scope !== 'selected_classes') return;
    for (const rule of input.rules) {
      const created = await tx.selfEnrollmentRule.create({
        data: { tenantId, targetClassId: rule.targetClassId, audience: rule.audience },
      });
      if (rule.audience === 'enrolled_in_classes' && rule.sourceClassIds.length) {
        await tx.selfEnrollmentRuleSourceClass.createMany({
          data: rule.sourceClassIds.map((classId) => ({ ruleId: created.id, classId })),
        });
      }
      if (rule.audience === 'batches' && rule.sourceBatchIds.length) {
        await tx.selfEnrollmentRuleSourceBatch.createMany({
          data: rule.sourceBatchIds.map((batchId) => ({ ruleId: created.id, batchId })),
        });
      }
    }
  });
}

export async function validateSelfEnrollmentConfig(tenantId: string, input: SelfEnrollmentConfig) {
  if (!input.enabled) return { enabled: false, scope: input.scope, rules: [] };
  if (input.scope === 'all_classes') return { enabled: true, scope: 'all_classes' as const, rules: [] };
  if (!input.rules.length) throw new Error('Add at least one class rule when using selected classes scope');
  const classIds = new Set(input.rules.flatMap((rule) => [rule.targetClassId, ...rule.sourceClassIds]));
  const batchIds = new Set(input.rules.flatMap((rule) => rule.sourceBatchIds));
  const [classes, batches] = await Promise.all([
    basePrisma.class.findMany({ where: { tenantId, id: { in: [...classIds] } }, select: { id: true, isPublished: true } }),
    basePrisma.batch.findMany({ where: { tenantId, id: { in: [...batchIds] } }, select: { id: true } }),
  ]);
  if (classes.length !== classIds.size || batches.length !== batchIds.size) {
    throw new Error('One or more classes or batches are invalid for this institute');
  }
  const rules = input.rules.map((rule) => {
    if (!classes.find((klass) => klass.id === rule.targetClassId)?.isPublished) {
      throw new Error('Self-enrollment target classes must be published');
    }
    if (rule.audience === 'batches' && !rule.sourceBatchIds.length) {
      throw new Error('Select at least one batch for batch-restricted rules');
    }
    if (rule.audience === 'enrolled_in_classes' && !rule.sourceClassIds.length) {
      throw new Error('Select at least one source class for enrollment-restricted rules');
    }
    return rule;
  });
  return { enabled: true, scope: 'selected_classes' as const, rules };
}

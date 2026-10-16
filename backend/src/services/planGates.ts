import type { Tenant, TenantPlan } from '@prisma/client';
import { forbidden, paymentRequired } from '../utils/httpError';

export type PlanFeature =
  | 'aiStudent'
  | 'aiTeacher'
  | 'parentTrust'
  | 'interventions'
  | 'smartJobs';

export type PlanFeatureMap = {
  aiStudent: boolean;
  aiTeacher: boolean;
  parentTrust: boolean;
  interventions: boolean;
  smartJobs: boolean;
  maxStudents: number | null;
  aiTokenLimit: number;
};

const PLAN_DEFAULTS: Record<TenantPlan, PlanFeatureMap> = {
  pro: {
    aiStudent: true,
    aiTeacher: true,
    parentTrust: false,
    interventions: true,
    smartJobs: true,
    maxStudents: 200,
    aiTokenLimit: 100,
  },
  enterprise: {
    aiStudent: true,
    aiTeacher: true,
    parentTrust: true,
    interventions: true,
    smartJobs: true,
    maxStudents: null,
    aiTokenLimit: 100,
  },
};

export function resolvePlanFeatures(tenant: {
  plan: TenantPlan;
  planFeatures?: unknown;
}): PlanFeatureMap {
  const base = { ...PLAN_DEFAULTS[tenant.plan] };
  const overrides = (tenant.planFeatures ?? {}) as Partial<PlanFeatureMap>;
  return {
    aiStudent: overrides.aiStudent ?? base.aiStudent,
    aiTeacher: overrides.aiTeacher ?? base.aiTeacher,
    parentTrust: overrides.parentTrust ?? base.parentTrust,
    interventions: overrides.interventions ?? base.interventions,
    smartJobs: overrides.smartJobs ?? base.smartJobs,
    maxStudents: overrides.maxStudents !== undefined ? overrides.maxStudents : base.maxStudents,
    aiTokenLimit: overrides.aiTokenLimit ?? base.aiTokenLimit,
  };
}

export function assertFeature(
  tenant: Pick<Tenant, 'plan' | 'planFeatures' | 'name'>,
  feature: PlanFeature
) {
  const features = resolvePlanFeatures(tenant);
  if (!features[feature]) {
    throw forbidden(
      `This feature requires a plan upgrade. Current plan: ${tenant.plan}. Contact platform support.`
    );
  }
  return features;
}

export function getAiTokenLimit(tenant: Pick<Tenant, 'plan' | 'planFeatures'>) {
  return resolvePlanFeatures(tenant).aiTokenLimit;
}

export function assertStudentCapacity(
  tenant: Pick<Tenant, 'plan' | 'planFeatures'>,
  currentStudentCount: number
) {
  const { maxStudents } = resolvePlanFeatures(tenant);
  if (maxStudents != null && currentStudentCount >= maxStudents) {
    throw paymentRequired(
      `Student limit reached for ${tenant.plan} plan (${maxStudents}). Upgrade to Enterprise for unlimited students.`
    );
  }
}

export { PLAN_DEFAULTS };

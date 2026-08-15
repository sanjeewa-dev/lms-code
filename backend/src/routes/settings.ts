import { Router } from 'express';
import { basePrisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole } from '../middleware/auth';
import { instituteSettingsSchema } from '../validation/schemas';
import { uploadLogo } from '../middleware/upload';
import { persistUploadedFile } from '../services/files';
import {
  replaceSelfEnrollmentPolicy,
  serializeSelfEnrollmentPolicy,
  validateSelfEnrollmentConfig,
} from '../services/selfEnrollmentPolicy';
import { badRequest } from '../utils/httpError';

const router = Router({ mergeParams: true });

function serializeSettings(t: {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankBranch: string | null;
  paymentInstructions: string | null;
  graceDays: number;
  requireMonthlyPayment: boolean;
  payhereMerchantId: string | null;
  payhereMerchantSecret: string | null;
  payhereEnabled: boolean;
  selfEnrollmentEnabled: boolean;
  selfEnrollmentScope: 'all_classes' | 'selected_classes';
  selfEnrollmentRules: {
    targetClassId: string;
    audience: 'all_students' | 'batches' | 'enrolled_in_classes';
    sourceClasses: { classId: string }[];
    sourceBatches: { batchId: string }[];
  }[];
}) {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    logoUrl: t.logoUrl,
    contactEmail: t.contactEmail,
    contactPhone: t.contactPhone,
    bankName: t.bankName,
    bankAccountName: t.bankAccountName,
    bankAccountNumber: t.bankAccountNumber,
    bankBranch: t.bankBranch,
    paymentInstructions: t.paymentInstructions,
    graceDays: t.graceDays,
    requireMonthlyPayment: t.requireMonthlyPayment,
    payhereMerchantId: t.payhereMerchantId,
    payhereMerchantSecret: t.payhereMerchantSecret ? '••••••••' : null,
    hasPayhereSecret: Boolean(t.payhereMerchantSecret),
    payhereEnabled: t.payhereEnabled,
    selfEnrollment: serializeSelfEnrollmentPolicy(t),
  };
}

const tenantSettingsInclude = {
  selfEnrollmentRules: {
    include: {
      sourceClasses: { select: { classId: true } },
      sourceBatches: { select: { batchId: true } },
    },
  },
} as const;

/** Public payment instructions for students (no merchant secrets beyond enabled flag). */
router.get(
  '/settings/payment-info',
  authenticate,
  asyncHandler(async (req, res) => {
    const t = await basePrisma.tenant.findFirst({
      where: { id: req.tenant!.id },
      include: tenantSettingsInclude,
    });
    if (!t) return res.json({ paymentInfo: null });
    res.json({
      paymentInfo: {
        bankName: t.bankName,
        bankAccountName: t.bankAccountName,
        bankAccountNumber: t.bankAccountNumber,
        bankBranch: t.bankBranch,
        paymentInstructions: t.paymentInstructions,
        graceDays: t.graceDays,
        requireMonthlyPayment: t.requireMonthlyPayment,
        payhereEnabled: t.payhereEnabled,
      },
    });
  })
);

router.get(
  '/settings',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const t = await basePrisma.tenant.findFirst({
      where: { id: req.tenant!.id },
      include: tenantSettingsInclude,
    });
    res.json({ settings: t ? serializeSettings(t) : null });
  })
);

router.patch(
  '/settings',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const data = instituteSettingsSchema.parse(req.body);
    const emptyToNull = (v: string | null | undefined) =>
      v === undefined ? undefined : v === '' || v === null ? null : v;

    if (data.selfEnrollment) {
      try {
        const validated = await validateSelfEnrollmentConfig(req.tenant!.id, {
          enabled: data.selfEnrollment.enabled,
          scope: data.selfEnrollment.scope,
          rules: (data.selfEnrollment.rules ?? []).map((rule) => ({
            targetClassId: rule.targetClassId,
            audience: rule.audience,
            sourceClassIds: rule.sourceClassIds ?? [],
            sourceBatchIds: rule.sourceBatchIds ?? [],
          })),
        });
        await replaceSelfEnrollmentPolicy(req.tenant!.id, validated);
      } catch (err) {
        throw badRequest(err instanceof Error ? err.message : 'Invalid self-enrollment settings');
      }
    }

    const updated = await basePrisma.tenant.update({
      where: { id: req.tenant!.id },
      data: {
        name: data.name,
        logoUrl: emptyToNull(data.logoUrl as string | null | undefined),
        contactEmail: emptyToNull(data.contactEmail as string | null | undefined),
        contactPhone: emptyToNull(data.contactPhone as string | null | undefined),
        bankName: emptyToNull(data.bankName as string | null | undefined),
        bankAccountName: emptyToNull(data.bankAccountName as string | null | undefined),
        bankAccountNumber: emptyToNull(data.bankAccountNumber as string | null | undefined),
        bankBranch: emptyToNull(data.bankBranch as string | null | undefined),
        paymentInstructions: emptyToNull(data.paymentInstructions as string | null | undefined),
        graceDays: data.graceDays,
        requireMonthlyPayment: data.requireMonthlyPayment,
        payhereMerchantId: emptyToNull(data.payhereMerchantId as string | null | undefined),
        // Never overwrite with masked placeholder from the UI
        payhereMerchantSecret:
          data.payhereMerchantSecret === undefined || data.payhereMerchantSecret === '••••••••'
            ? undefined
            : emptyToNull(data.payhereMerchantSecret as string | null | undefined),
        payhereEnabled: data.payhereEnabled,
      },
      include: tenantSettingsInclude,
    });

    res.json({ settings: serializeSettings(updated) });
  })
);

router.post(
  '/settings/logo',
  authenticate,
  requireRole('admin'),
  uploadLogo,
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Please choose a logo image (JPEG, PNG, WebP, or GIF)');

    const file = await persistUploadedFile(req.file, req.user!.sub, 'logo');
    const logoUrl = `/api/t/${req.tenant!.slug}/public/logo/${file.id}`;

    const updated = await basePrisma.tenant.update({
      where: { id: req.tenant!.id },
      data: { logoUrl },
      include: tenantSettingsInclude,
    });

    res.json({ settings: serializeSettings(updated) });
  })
);

export default router;

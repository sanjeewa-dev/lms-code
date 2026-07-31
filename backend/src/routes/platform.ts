import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { basePrisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole } from '../middleware/auth';
import { issueTokens, publicUser } from '../services/auth';
import {
  changePasswordSchema,
  createTenantAdminSchema,
  createTenantSchema,
  loginSchema,
  profileUpdateSchema,
  updateTenantSchema,
} from '../validation/schemas';
import { publicUserFromProfile, serializeProfile } from '../services/profile';
import { badRequest, conflict, notFound, unauthorized } from '../utils/httpError';
import { writeAuditLog } from '../services/audit';
import { resolvePlanFeatures } from '../services/planGates';

// Mounted at /api/admin
const router = Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false });

function clientIp(req: { ip?: string; headers: Record<string, unknown> }) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0]?.trim();
  return req.ip ?? null;
}

/** Build a URL slug from institute name; ensure uniqueness with numeric suffix. */
async function uniqueSlugFromName(name: string): Promise<string> {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const root = base.length >= 2 ? base : 'institute';

  let slug = root;
  let n = 2;
  while (await basePrisma.tenant.findUnique({ where: { slug } })) {
    const suffix = `-${n}`;
    slug = `${root.slice(0, Math.max(2, 50 - suffix.length))}${suffix}`;
    n += 1;
  }
  return slug;
}

// Platform super-admin login (no tenant).
router.post(
  '/auth/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body);
    const user = await basePrisma.user.findFirst({
      where: { email: data.email, role: 'superadmin', tenantId: null },
    });
    if (!user) throw unauthorized('Invalid email or password');
    if (!user.passwordHash) throw unauthorized('Invalid email or password');
    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) throw unauthorized('Invalid email or password');
    const tokens = await issueTokens(user);
    res.json({ user: publicUser(user), ...tokens });
  })
);

const requireSuperadmin = [authenticate, requireRole('superadmin')];

// List all tenants with basic stats.
router.get(
  '/tenants',
  ...requireSuperadmin,
  asyncHandler(async (_req, res) => {
    const tenants = await basePrisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true, classes: true } } },
    });
    res.json({
      tenants: tenants.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        logoUrl: t.logoUrl,
        isActive: t.isActive,
        plan: t.plan,
        createdAt: t.createdAt,
        userCount: t._count.users,
        classCount: t._count.classes,
      })),
    });
  })
);

// Create a tenant and its first admin in one transaction.
router.post(
  '/tenants',
  ...requireSuperadmin,
  asyncHandler(async (req, res) => {
    const data = createTenantSchema.parse(req.body);
    const slug = await uniqueSlugFromName(data.name);

    const passwordHash = await bcrypt.hash(data.admin.password, 10);
    const tenant = await basePrisma.tenant.create({
      data: {
        name: data.name,
        slug,
        logoUrl: data.logoUrl,
        plan: 'pro',
        users: {
          create: {
            name: data.admin.name,
            email: data.admin.email,
            passwordHash,
            role: 'admin',
          },
        },
      },
      include: { _count: { select: { users: true, classes: true } } },
    });

    await writeAuditLog({
      actorId: req.user!.sub,
      actorEmail: req.user!.email,
      action: 'tenant.create',
      tenantId: tenant.id,
      targetType: 'Tenant',
      targetId: tenant.id,
      meta: { slug: tenant.slug },
      ip: clientIp(req),
    });

    res.status(201).json({
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        logoUrl: tenant.logoUrl,
        isActive: tenant.isActive,
        plan: tenant.plan,
        createdAt: tenant.createdAt,
        userCount: tenant._count.users,
        classCount: tenant._count.classes,
      },
    });
  })
);

router.patch(
  '/tenants/:id',
  ...requireSuperadmin,
  asyncHandler(async (req, res) => {
    const data = updateTenantSchema.parse(req.body);
    const tenant = await basePrisma.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) throw notFound('Tenant not found');
    const updated = await basePrisma.tenant.update({
      where: { id: tenant.id },
      data: {
        name: data.name,
        logoUrl: data.logoUrl,
        isActive: data.isActive,
        plan: data.plan,
        ...(data.planFeatures !== undefined ? { planFeatures: data.planFeatures } : {}),
      },
    });

    await writeAuditLog({
      actorId: req.user!.sub,
      actorEmail: req.user!.email,
      action: 'tenant.update',
      tenantId: updated.id,
      targetType: 'Tenant',
      targetId: updated.id,
      meta: { plan: updated.plan, isActive: updated.isActive },
      ip: clientIp(req),
    });

    res.json({
      tenant: {
        ...updated,
        features: resolvePlanFeatures(updated),
        hasPayhereSecret: Boolean(updated.payhereMerchantSecret),
        payhereMerchantSecret: undefined,
      },
    });
  })
);

// Add another admin to an existing tenant.
router.post(
  '/tenants/:id/admins',
  ...requireSuperadmin,
  asyncHandler(async (req, res) => {
    const data = createTenantAdminSchema.parse(req.body);
    const tenant = await basePrisma.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) throw notFound('Tenant not found');

    const existing = await basePrisma.user.findFirst({
      where: { tenantId: tenant.id, email: data.email },
    });
    if (existing) throw badRequest('A user with that email already exists in this tenant');

    const passwordHash = await bcrypt.hash(data.password, 10);
    const admin = await basePrisma.user.create({
      data: {
        tenantId: tenant.id,
        name: data.name,
        email: data.email,
        passwordHash,
        role: 'admin',
      },
    });
    res.status(201).json({ admin: publicUser(admin) });
  })
);

// Aggregate stats for a tenant.
router.get(
  '/tenants/:id/stats',
  ...requireSuperadmin,
  asyncHandler(async (req, res) => {
    const tenant = await basePrisma.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) throw notFound('Tenant not found');
    const [users, classes, students, teachers, pendingPayments] = await Promise.all([
      basePrisma.user.count({ where: { tenantId: tenant.id } }),
      basePrisma.class.count({ where: { tenantId: tenant.id } }),
      basePrisma.user.count({ where: { tenantId: tenant.id, role: 'student' } }),
      basePrisma.user.count({ where: { tenantId: tenant.id, role: 'teacher' } }),
      basePrisma.payment.count({ where: { tenantId: tenant.id, status: 'pending' } }),
    ]);
    res.json({ stats: { users, classes, students, teachers, pendingPayments } });
  })
);

// Platform super-admin profile (no tenant).
router.get(
  '/profile',
  ...requireSuperadmin,
  asyncHandler(async (req, res) => {
    const user = await basePrisma.user.findUnique({
      where: { id: req.user!.sub },
    });
    if (!user || user.role !== 'superadmin') throw notFound('Profile not found');
    res.json({ profile: serializeProfile(user) });
  })
);

router.patch(
  '/profile',
  ...requireSuperadmin,
  asyncHandler(async (req, res) => {
    const user = await basePrisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user || user.role !== 'superadmin') throw notFound('Profile not found');

    const data = profileUpdateSchema.parse(req.body);
    if (data.email && data.email !== user.email) {
      const clash = await basePrisma.user.findFirst({
        where: { email: data.email, id: { not: user.id } },
      });
      if (clash) throw conflict('That email is already in use');
    }

    const updated = await basePrisma.user.update({
      where: { id: user.id },
      data: {
        name: data.name ?? user.name,
        email: data.email ?? user.email,
      },
    });

    res.json({
      profile: serializeProfile(updated),
      user: publicUserFromProfile(updated),
    });
  })
);

router.post(
  '/profile/password',
  ...requireSuperadmin,
  asyncHandler(async (req, res) => {
    const data = changePasswordSchema.parse(req.body);
    const user = await basePrisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user?.passwordHash) throw unauthorized('Invalid credentials');

    const valid = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!valid) throw unauthorized('Current password is incorrect');

    await basePrisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(data.newPassword, 10) },
    });

    res.json({ ok: true });
  })
);

export default router;

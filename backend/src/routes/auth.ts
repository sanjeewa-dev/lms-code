import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { basePrisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { verifyRefreshToken } from '../lib/jwt';
import { authenticate } from '../middleware/auth';
import { badRequest, unauthorized } from '../utils/httpError';
import { issueTokens, publicUser } from '../services/auth';
import { loginSchema } from '../validation/schemas';
import { getActiveSupportSession } from '../services/supportSession';

const router = Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false });

/**
 * Unified sign-in. Resolves the account by email + password across the whole
 * platform (super-admin and all tenants). Because emails are unique only per
 * tenant, when the same credentials match more than one institute we return a
 * disambiguation list so the client can ask which institute to enter.
 */
router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const tenantSlug = typeof req.body?.tenantSlug === 'string' ? req.body.tenantSlug : undefined;

    const users = await basePrisma.user.findMany({
      where: { email, ...(tenantSlug ? { tenant: { slug: tenantSlug } } : {}) },
      include: { tenant: true },
    });

    const matched = [] as typeof users;
    for (const u of users) {
      if (u.role !== 'superadmin' && u.tenant && !u.tenant.isActive) continue;
      if (!u.passwordHash) continue;
      if (await bcrypt.compare(password, u.passwordHash)) matched.push(u);
    }

    if (matched.length === 0) {
      const incomplete = users.find((u) => !u.passwordHash && u.role === 'student');
      if (incomplete) {
        throw unauthorized(
          'Please complete your registration using the invite link sent to your email.'
        );
      }
      throw unauthorized('Invalid email or password');
    }

    // Non-superadmins must be approved (rejected = inactivated).
    const allowed = matched.filter((u) => u.role === 'superadmin' || u.status === 'approved');
    if (allowed.length === 0) {
      const status = matched[0].status;
      throw unauthorized(
        status === 'pending'
          ? 'Your account is pending approval by the institute.'
          : 'Your account has been inactivated. Please contact your institute or platform support.'
      );
    }

    if (allowed.length > 1) {
      res.json({
        multiple: true,
        tenants: allowed
          .filter((m) => m.tenant)
          .map((m) => ({ slug: m.tenant!.slug, name: m.tenant!.name })),
      });
      return;
    }

    const user = allowed[0];
    const tokens = await issueTokens(user);
    res.json({
      user: publicUser(user),
      ...tokens,
      tenant: user.tenant ? { slug: user.tenant.slug, name: user.tenant.name } : null,
    });
  })
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = req.body?.refreshToken as string | undefined;
    if (!token) throw badRequest('refreshToken is required');

    let payload: { sub: string };
    try {
      payload = verifyRefreshToken(token);
    } catch {
      throw unauthorized('Invalid refresh token');
    }

    const stored = await basePrisma.refreshToken.findUnique({ where: { token } });
    if (!stored || stored.expiresAt < new Date()) {
      throw unauthorized('Refresh token expired or revoked');
    }

    const user = await basePrisma.user.findUnique({
      where: { id: payload.sub },
      include: { tenant: true },
    });
    if (!user) throw unauthorized('User no longer exists');

    await basePrisma.refreshToken.delete({ where: { token } }).catch(() => undefined);
    const tokens = await issueTokens(user);
    res.json({ user: publicUser(user), ...tokens });
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = req.body?.refreshToken as string | undefined;
    if (token) await basePrisma.refreshToken.deleteMany({ where: { token } });
    res.status(204).send();
  })
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await basePrisma.user.findUnique({
      where: { id: req.user!.sub },
      include: { tenant: true },
    });
    if (!user) throw unauthorized();

    let supportExtras: Parameters<typeof publicUser>[1] | undefined;
    if (req.user!.supportSessionId && user.role === 'superadmin') {
      const session = await getActiveSupportSession(req.user!.supportSessionId, user.id);
      if (session) {
        supportExtras = {
          supportSession: {
            id: session.id,
            tenantId: session.tenant.id,
            tenantSlug: session.tenant.slug,
            tenantName: session.tenant.name,
            expiresAt: session.expiresAt.toISOString(),
          },
        };
      }
    }

    res.json({ user: publicUser(user, supportExtras) });
  })
);

export default router;

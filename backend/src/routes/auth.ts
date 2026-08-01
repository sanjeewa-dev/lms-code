import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { basePrisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { verifyRefreshToken } from '../lib/jwt';
import { authenticate } from '../middleware/auth';
import { unauthorized } from '../utils/httpError';
import {
  assertUserMayAuthenticate,
  issueTokens,
  publicUser,
} from '../services/auth';
import { loginSchema } from '../validation/schemas';
import { getActiveSupportSession } from '../services/supportSession';
import { hashToken } from '../utils/cryptoTokens';
import { clearRefreshCookie, REFRESH_COOKIE, setRefreshCookie } from '../utils/authCookies';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

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
      if (u.status !== 'approved' && u.role !== 'superadmin') continue;
      if (await bcrypt.compare(password, u.passwordHash)) matched.push(u);
    }

    // Uniform message avoids account-state enumeration.
    if (matched.length === 0) {
      throw unauthorized('Invalid email or password');
    }

    if (matched.length > 1) {
      res.json({
        multiple: true,
        tenants: matched
          .filter((m) => m.tenant)
          .map((m) => ({ slug: m.tenant!.slug, name: m.tenant!.name })),
      });
      return;
    }

    const user = matched[0];
    const tokens = await issueTokens(user);
    setRefreshCookie(res, tokens.refreshToken);
    res.json({
      user: publicUser(user),
      ...tokens,
      tenant: user.tenant ? { slug: user.tenant.slug, name: user.tenant.name } : null,
    });
  })
);

router.post(
  '/refresh',
  refreshLimiter,
  asyncHandler(async (req, res) => {
    const token =
      (typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined) ||
      (typeof req.cookies?.[REFRESH_COOKIE] === 'string' ? req.cookies[REFRESH_COOKIE] : undefined);
    if (!token) throw unauthorized('Invalid refresh token');

    let payload: { sub: string };
    try {
      payload = verifyRefreshToken(token);
    } catch {
      clearRefreshCookie(res);
      throw unauthorized('Invalid refresh token');
    }

    const tokenHash = hashToken(token);
    const stored = await basePrisma.refreshToken.findFirst({
      where: {
        OR: [{ token: tokenHash }, { token }], // support legacy plaintext rows during rollout
      },
    });
    if (!stored || stored.expiresAt < new Date() || stored.userId !== payload.sub) {
      clearRefreshCookie(res);
      throw unauthorized('Refresh token expired or revoked');
    }

    const user = await basePrisma.user.findUnique({
      where: { id: payload.sub },
      include: { tenant: true },
    });
    if (!user) {
      clearRefreshCookie(res);
      throw unauthorized('Invalid refresh token');
    }

    try {
      assertUserMayAuthenticate(user);
    } catch {
      await basePrisma.refreshToken.deleteMany({ where: { userId: user.id } });
      clearRefreshCookie(res);
      throw unauthorized('Invalid refresh token');
    }

    await basePrisma.refreshToken.delete({ where: { id: stored.id } }).catch(() => undefined);
    const tokens = await issueTokens(user);
    setRefreshCookie(res, tokens.refreshToken);
    res.json({ user: publicUser(user), ...tokens });
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token =
      (typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined) ||
      (typeof req.cookies?.[REFRESH_COOKIE] === 'string' ? req.cookies[REFRESH_COOKIE] : undefined);
    if (token) {
      const tokenHash = hashToken(token);
      await basePrisma.refreshToken.deleteMany({
        where: { OR: [{ token: tokenHash }, { token }] },
      });
    }
    clearRefreshCookie(res);
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

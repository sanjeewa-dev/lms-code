import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { basePrisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { loginSchema, registerSchema } from '../validation/schemas';
import { issueTokens, publicUser } from '../services/auth';
import { resolveTenant } from '../middleware/tenant';
import { badRequest, unauthorized } from '../utils/httpError';

// Mounted at /api/t/:slug/auth
const router = Router({ mergeParams: true });

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

// Student self-registration into a specific tenant.
router.post(
  '/register',
  authLimiter,
  resolveTenant,
  asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);
    const tenantId = req.tenant!.id;

    const existing = await basePrisma.user.findFirst({
      where: { tenantId, email: data.email },
    });
    if (existing) throw badRequest('Email is already registered at this institute');

    const passwordHash = await bcrypt.hash(data.password, 10);
    await basePrisma.user.create({
      data: {
        tenantId,
        name: data.name,
        email: data.email,
        passwordHash,
        role: 'student',
        status: 'pending',
      },
    });

    // New students await admin approval; no session is issued yet.
    res.status(201).json({ pending: true });
  })
);

router.post(
  '/login',
  authLimiter,
  resolveTenant,
  asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body);
    const tenantId = req.tenant!.id;

    const user = await basePrisma.user.findFirst({
      where: { tenantId, email: data.email },
    });
    if (!user) throw unauthorized('Invalid email or password');

    if (!user.passwordHash) {
      throw unauthorized('Please complete your registration using the invite link sent to your email.');
    }

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) throw unauthorized('Invalid email or password');

    if (user.role === 'student' && user.status !== 'approved') {
      throw unauthorized(
        user.status === 'pending'
          ? 'Your account is pending approval by the institute.'
          : 'Your account has been rejected. Please contact your institute.'
      );
    }

    const tokens = await issueTokens(user);
    res.json({ user: publicUser({ ...user, tenant: req.tenant! }), ...tokens });
  })
);

export default router;

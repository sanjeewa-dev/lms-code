import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { basePrisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { loginSchema, registerSchema } from '../validation/schemas';
import { issueTokens, publicUser } from '../services/auth';
import { resolveTenant, enterTenantContext } from '../middleware/tenant';
import { unauthorized, notFound, badRequest, forbidden } from '../utils/httpError';
import { setRefreshCookie } from '../utils/authCookies';
import {
  canAnonymousRegisterForClass,
  loadSelfEnrollmentPolicy,
} from '../services/selfEnrollmentPolicy';
import { enrollmentStatusForNetFee } from '../lib/fees';

// Mounted at /api/t/:slug/auth
const router = Router({ mergeParams: true });

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// Student self-registration requires an anonymous-access self-enrollment policy.
router.post(
  '/register',
  authLimiter,
  resolveTenant,
  enterTenantContext,
  asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);
    const tenantId = req.tenant!.id;

    const policy = await loadSelfEnrollmentPolicy(tenantId);
    if (!policy || !canAnonymousRegisterForClass(policy, data.classId)) {
      throw forbidden(
        'Self-registration is not available for this class. Ask your teacher for an invite or class join link.'
      );
    }

    const klass = await basePrisma.class.findFirst({
      where: { id: data.classId, tenantId, isPublished: true },
      select: { id: true, price: true, title: true },
    });
    if (!klass) throw notFound('Class not found or not open for registration');

    const existing = await basePrisma.user.findFirst({
      where: { tenantId, email: data.email },
    });
    if (existing) throw badRequest('Email is already registered at this institute');

    const passwordHash = await bcrypt.hash(data.password, 10);
    const enrollmentStatus = enrollmentStatusForNetFee(klass.price, 0);

    await basePrisma.user.create({
      data: {
        tenantId,
        name: data.name,
        email: data.email,
        passwordHash,
        role: 'student',
        status: 'pending',
        enrollments: {
          create: {
            tenantId,
            classId: klass.id,
            status: enrollmentStatus,
            feeWaiverAmount: 0,
          },
        },
      },
    });

    // New students await admin approval; no session is issued yet.
    res.status(201).json({
      pending: true,
      class: { id: klass.id, title: klass.title },
      enrollmentStatus,
    });
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
    if (!user) throw unauthorized('Invalid credentials');

    if (!user.passwordHash) {
      throw unauthorized('Invalid credentials');
    }

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) throw unauthorized('Invalid credentials');

    if (user.status !== 'approved') throw unauthorized('Invalid credentials');

    const tokens = await issueTokens(user);
    setRefreshCookie(res, tokens.refreshToken);
    res.json({ user: publicUser({ ...user, tenant: req.tenant! }), ...tokens });
  })
);

export default router;

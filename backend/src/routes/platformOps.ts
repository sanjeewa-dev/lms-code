import { Router } from 'express';
import { z } from 'zod';
import { basePrisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole } from '../middleware/auth';
import { env } from '../config/env';
import { currentBillingMonth } from '../services/access';
import { computeAtRiskStudents } from '../services/atRisk';
import { runTrackedJob } from '../services/jobRuns';
import { runFeeRemindersAllTenants, runParentDigestsAllTenants } from '../services/smartJobs';
import { resolvePlanFeatures } from '../services/planGates';
import { writeAuditLog } from '../services/audit';
import { startSupportSession, endSupportSession } from '../services/supportSession';
import { schedulerArmed } from '../jobs/scheduler';
import { badRequest, notFound } from '../utils/httpError';

const router = Router();
const requireSuperadmin = [authenticate, requireRole('superadmin')];

function clientIp(req: { ip?: string; headers: Record<string, unknown> }) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0]?.trim();
  return req.ip ?? null;
}

router.get(
  '/overview',
  ...requireSuperadmin,
  asyncHandler(async (_req, res) => {
    const forMonth = currentBillingMonth();
    const [
      tenantsActive,
      tenantsInactive,
      tenantsPro,
      tenantsEnterprise,
      usersByRole,
      pendingPayments,
      approvedPayments,
      aiUsageSum,
      openInterventions,
      recentJobFailures,
      emailFailed,
    ] = await Promise.all([
      basePrisma.tenant.count({ where: { isActive: true } }),
      basePrisma.tenant.count({ where: { isActive: false } }),
      basePrisma.tenant.count({ where: { plan: 'pro' } }),
      basePrisma.tenant.count({ where: { plan: 'enterprise' } }),
      basePrisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      basePrisma.payment.count({ where: { status: 'pending' } }),
      basePrisma.payment.findMany({
        where: { status: 'approved', forMonth },
        select: { amount: true },
      }),
      basePrisma.aiUsage.aggregate({
        where: { forMonth },
        _sum: { used: true },
      }),
      basePrisma.intervention.count({ where: { status: { in: ['open', 'in_progress', 'escalated'] } } }),
      basePrisma.jobRun.findMany({
        where: { status: 'failed' },
        orderBy: { startedAt: 'desc' },
        take: 5,
      }),
      basePrisma.emailLog.count({
        where: { status: 'failed', createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      }),
    ]);

    const revenueMtd = approvedPayments.reduce((s, p) => s + Number(p.amount), 0);
    const roleCounts = Object.fromEntries(usersByRole.map((r) => [r.role, r._count._all]));

    res.json({
      overview: {
        tenants: {
          active: tenantsActive,
          inactive: tenantsInactive,
          pro: tenantsPro,
          enterprise: tenantsEnterprise,
        },
        users: roleCounts,
        payments: { pending: pendingPayments, revenueMtd, forMonth },
        aiTokensUsed: aiUsageSum._sum.used ?? 0,
        openInterventions,
        emailFailedLast7d: emailFailed,
        recentJobFailures: recentJobFailures.map((j) => ({
          id: j.id,
          job: j.job,
          error: j.error,
          startedAt: j.startedAt,
        })),
      },
    });
  })
);

router.get(
  '/health/deep',
  ...requireSuperadmin,
  asyncHandler(async (_req, res) => {
    let dbOk = false;
    let dbLatencyMs: number | null = null;
    const t0 = Date.now();
    try {
      await basePrisma.$queryRaw`SELECT 1`;
      dbOk = true;
      dbLatencyMs = Date.now() - t0;
    } catch {
      dbOk = false;
    }

    const lastJobs = await basePrisma.jobRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 10,
    });

    res.json({
      health: {
        status: dbOk ? 'ok' : 'degraded',
        time: new Date().toISOString(),
        db: { ok: dbOk, latencyMs: dbLatencyMs },
        smtpConfigured: Boolean(env.smtp.host && env.smtp.user),
        anthropicConfigured: Boolean(env.anthropicApiKey),
        schedulerArmed,
        lastJobs: lastJobs.map((j) => ({
          id: j.id,
          job: j.job,
          status: j.status,
          startedAt: j.startedAt,
          finishedAt: j.finishedAt,
          error: j.error,
        })),
      },
    });
  })
);

router.get(
  '/jobs',
  ...requireSuperadmin,
  asyncHandler(async (req, res) => {
    const take = Math.min(Number(req.query.take) || 50, 100);
    const jobs = await basePrisma.jobRun.findMany({
      orderBy: { startedAt: 'desc' },
      take,
      include: { tenant: { select: { id: true, slug: true, name: true } } },
    });
    res.json({ jobs });
  })
);

router.post(
  '/jobs/:name/run',
  ...requireSuperadmin,
  asyncHandler(async (req, res) => {
    const name = req.params.name;
    if (name !== 'fee_reminders' && name !== 'parent_digests') {
      throw badRequest('Unknown job. Use fee_reminders or parent_digests');
    }
    const results =
      name === 'fee_reminders'
        ? await runTrackedJob('fee_reminders', () => runFeeRemindersAllTenants())
        : await runTrackedJob('parent_digests', () => runParentDigestsAllTenants());

    await writeAuditLog({
      actorId: req.user!.sub,
      actorEmail: req.user!.email,
      action: 'job.run',
      targetType: 'JobRun',
      targetId: name,
      meta: { name },
      ip: clientIp(req),
    });

    res.json({ ok: true, results });
  })
);

router.get(
  '/emails',
  ...requireSuperadmin,
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const take = Math.min(Number(req.query.take) || 50, 100);
    const emails = await basePrisma.emailLog.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { createdAt: 'desc' },
      take,
      include: { tenant: { select: { id: true, slug: true, name: true } } },
    });
    res.json({ emails });
  })
);

router.get(
  '/ai/usage',
  ...requireSuperadmin,
  asyncHandler(async (req, res) => {
    const forMonth = typeof req.query.forMonth === 'string' ? req.query.forMonth : currentBillingMonth();
    const byTenant = await basePrisma.aiUsage.groupBy({
      by: ['tenantId'],
      where: { forMonth },
      _sum: { used: true },
      _count: { _all: true },
    });
    const tenantIds = byTenant.map((b) => b.tenantId);
    const tenants = await basePrisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, slug: true, name: true, plan: true },
    });
    const tenantMap = Object.fromEntries(tenants.map((t) => [t.id, t]));

    const byTool = await basePrisma.aiToolHistory.groupBy({
      by: ['tool'],
      where: {
        createdAt: {
          gte: new Date(`${forMonth}-01T00:00:00.000Z`),
        },
      },
      _count: { _all: true },
    });

    res.json({
      forMonth,
      byTenant: byTenant.map((b) => ({
        tenant: tenantMap[b.tenantId] ?? { id: b.tenantId },
        used: b._sum.used ?? 0,
        rows: b._count._all,
      })),
      byTool: byTool.map((t) => ({ tool: t.tool, count: t._count._all })),
    });
  })
);

router.get(
  '/payments/rollup',
  ...requireSuperadmin,
  asyncHandler(async (req, res) => {
    const forMonth = typeof req.query.forMonth === 'string' ? req.query.forMonth : currentBillingMonth();
    const payments = await basePrisma.payment.groupBy({
      by: ['tenantId', 'status'],
      where: { forMonth },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const tenantIds = [...new Set(payments.map((p) => p.tenantId))];
    const tenants = await basePrisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, slug: true, name: true },
    });
    const tenantMap = Object.fromEntries(tenants.map((t) => [t.id, t]));

    const byTenant: Record<
      string,
      { tenant: { id: string; slug?: string; name?: string }; approved: number; pending: number; rejected: number; approvedAmount: number }
    > = {};
    for (const p of payments) {
      if (!byTenant[p.tenantId]) {
        byTenant[p.tenantId] = {
          tenant: tenantMap[p.tenantId] ?? { id: p.tenantId },
          approved: 0,
          pending: 0,
          rejected: 0,
          approvedAmount: 0,
        };
      }
      const row = byTenant[p.tenantId];
      if (p.status === 'approved') {
        row.approved = p._count._all;
        row.approvedAmount = Number(p._sum.amount ?? 0);
      } else if (p.status === 'pending') row.pending = p._count._all;
      else if (p.status === 'rejected') row.rejected = p._count._all;
    }

    res.json({ forMonth, rollup: Object.values(byTenant) });
  })
);

router.get(
  '/users',
  ...requireSuperadmin,
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined;
    const take = Math.min(Number(req.query.take) || 50, 100);

    const users = await basePrisma.user.findMany({
      where: {
        ...(role ? { role: role as any } : {}),
        ...(tenantId ? { tenantId } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      take,
      orderBy: { createdAt: 'desc' },
      include: { tenant: { select: { id: true, slug: true, name: true } } },
    });

    res.json({
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        tenantId: u.tenantId,
        tenant: u.tenant,
        createdAt: u.createdAt,
      })),
    });
  })
);

const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
});

router.patch(
  '/users/:id',
  ...requireSuperadmin,
  asyncHandler(async (req, res) => {
    const data = updateUserSchema.parse(req.body);
    const user = await basePrisma.user.findUnique({
      where: { id: req.params.id },
      include: { tenant: { select: { id: true, slug: true, name: true } } },
    });
    if (!user) throw notFound('User not found');
    if (user.id === req.user!.sub) throw badRequest('You cannot change your own account status here');
    if (user.role === 'superadmin' && data.status === 'rejected') {
      throw badRequest('Cannot inactivate a superadmin account');
    }

    if (data.email && data.email !== user.email) {
      const clash = await basePrisma.user.findFirst({
        where: {
          email: data.email,
          tenantId: user.tenantId,
          id: { not: user.id },
        },
      });
      if (clash) throw badRequest('That email is already in use in this institute');
    }

    const updated = await basePrisma.user.update({
      where: { id: user.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
      include: { tenant: { select: { id: true, slug: true, name: true } } },
    });

    await writeAuditLog({
      actorId: req.user!.sub,
      actorEmail: req.user!.email,
      action: 'user.update',
      tenantId: updated.tenantId,
      targetType: 'User',
      targetId: updated.id,
      meta: { name: updated.name, email: updated.email, status: updated.status },
      ip: clientIp(req),
    });

    res.json({
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        status: updated.status,
        tenantId: updated.tenantId,
        tenant: updated.tenant,
        createdAt: updated.createdAt,
      },
    });
  })
);

router.get(
  '/audit',
  ...requireSuperadmin,
  asyncHandler(async (req, res) => {
    const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined;
    const action = typeof req.query.action === 'string' ? req.query.action : undefined;
    const take = Math.min(Number(req.query.take) || 50, 100);
    const logs = await basePrisma.auditLog.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ...(action ? { action: { contains: action } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      include: { tenant: { select: { id: true, slug: true, name: true } } },
    });
    res.json({ logs });
  })
);

router.get(
  '/tenants/:id/detail',
  ...requireSuperadmin,
  asyncHandler(async (req, res) => {
    const tenant = await basePrisma.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) throw notFound('Tenant not found');

    const forMonth = currentBillingMonth();
    const [
      users,
      classes,
      students,
      teachers,
      pendingPayments,
      enrollments,
      aiUsed,
      openInterventions,
      admins,
      classRows,
      studentRows,
      teacherRows,
      atRisk,
    ] = await Promise.all([
      basePrisma.user.count({ where: { tenantId: tenant.id } }),
      basePrisma.class.count({ where: { tenantId: tenant.id } }),
      basePrisma.user.count({ where: { tenantId: tenant.id, role: 'student' } }),
      basePrisma.user.count({ where: { tenantId: tenant.id, role: 'teacher' } }),
      basePrisma.payment.count({ where: { tenantId: tenant.id, status: 'pending' } }),
      basePrisma.enrollment.count({ where: { tenantId: tenant.id, status: 'active' } }),
      basePrisma.aiUsage.aggregate({ where: { tenantId: tenant.id, forMonth }, _sum: { used: true } }),
      basePrisma.intervention.count({
        where: { tenantId: tenant.id, status: { in: ['open', 'in_progress', 'escalated'] } },
      }),
      basePrisma.user.findMany({
        where: { tenantId: tenant.id, role: 'admin' },
        select: { id: true, name: true, email: true, createdAt: true },
      }),
      basePrisma.class.findMany({
        where: { tenantId: tenant.id },
        select: {
          id: true,
          title: true,
          teacher: { select: { id: true, name: true } },
          _count: { select: { enrollments: true, quizzes: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
      basePrisma.user.findMany({
        where: { tenantId: tenant.id, role: 'student' },
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          guardianEmail: true,
          _count: { select: { enrollments: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
      basePrisma.user.findMany({
        where: { tenantId: tenant.id, role: 'teacher' },
        select: {
          id: true,
          name: true,
          email: true,
          _count: { select: { classesOwned: true } },
        },
        orderBy: { name: 'asc' },
        take: 40,
      }),
      computeAtRiskStudents(tenant.id),
    ]);

    // Attendance rates for classes (30d)
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const classHealth = await Promise.all(
      classRows.map(async (c) => {
        const att = await basePrisma.attendance.findMany({
          where: { classId: c.id, sessionDate: { gte: since } },
        });
        const present = att.filter((a) => a.status === 'present' || a.status === 'late').length;
        const attempts = await basePrisma.quizAttempt.count({
          where: { quiz: { classId: c.id }, submittedAt: { not: null } },
        });
        return {
          id: c.id,
          title: c.title,
          teacher: c.teacher,
          enrollments: c._count.enrollments,
          quizzes: c._count.quizzes,
          quizAttempts: attempts,
          attendanceRate: att.length >= 3 ? Math.round((present / att.length) * 100) : null,
        };
      })
    );

    const { payhereMerchantSecret: _secret, ...safeTenant } = tenant;

    res.json({
      tenant: {
        ...safeTenant,
        hasPayhereSecret: Boolean(tenant.payhereMerchantSecret),
        features: resolvePlanFeatures(tenant),
      },
      stats: {
        users,
        classes,
        students,
        teachers,
        pendingPayments,
        enrollments,
        aiTokensUsed: aiUsed._sum.used ?? 0,
        openInterventions,
        atRiskCount: atRisk.length,
        forMonth,
      },
      admins,
      classes: classHealth,
      students: studentRows,
      teachers: teacherRows,
      atRisk: atRisk.slice(0, 10),
    });
  })
);

const supportSchema = z.object({
  reason: z.string().min(5).max(1000),
});

router.post(
  '/tenants/:id/support-session',
  ...requireSuperadmin,
  asyncHandler(async (req, res) => {
    const data = supportSchema.parse(req.body);
    const result = await startSupportSession({
      superadminId: req.user!.sub,
      superadminEmail: req.user!.email,
      tenantId: req.params.id,
      reason: data.reason,
      ip: clientIp(req),
    });
    res.status(201).json(result);
  })
);

router.post(
  '/support-sessions/:id/end',
  ...requireSuperadmin,
  asyncHandler(async (req, res) => {
    const result = await endSupportSession({
      sessionId: req.params.id,
      superadminId: req.user!.sub,
      superadminEmail: req.user!.email,
      ip: clientIp(req),
    });
    res.json(result);
  })
);

export default router;

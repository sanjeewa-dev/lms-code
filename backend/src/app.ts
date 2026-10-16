import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import { inFlightLimiter } from './middleware/inFlight';

import authRoutes from './routes/auth';
import platformRoutes from './routes/platform';
import platformOpsRoutes from './routes/platformOps';
import tenantAuthRoutes from './routes/tenantAuth';
import publicTenantRoutes from './routes/publicTenant';
import payherePublicRoutes from './routes/payherePublic';
import inviteRoutes from './routes/invites';
import adminInviteRoutes from './routes/adminInvites';
import classJoinRoutes from './routes/classJoin';
import tenantRoutes from './routes/tenant';
import cronRoutes from './routes/cron';

export function createApp() {
  const app = express();

  // When behind Caddy/nginx, trust the first proxy hop so rate limiting and
  // secure cookies see the real client IP from X-Forwarded-For.
  if (env.nodeEnv === 'production' || process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  app.use(helmet());
  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(inFlightLimiter(env.maxInFlightPerWorker));
  const apiRateLimitMax = Number.parseInt(process.env.API_RATE_LIMIT_MAX ?? '60000', 10);
  if (apiRateLimitMax > 0) {
    app.use(
      '/api',
      rateLimit({
        windowMs: 60 * 1000,
        max: apiRateLimitMax,
        standardHeaders: true,
        legacyHeaders: false,
      })
    );
  }
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  if (env.nodeEnv === 'development') app.use(morgan('dev'));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

  // Shared auth (refresh/logout/me) and platform (superadmin) routes.
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', platformRoutes);
  app.use('/api/admin', platformOpsRoutes);
  app.use('/api/cron', cronRoutes);

  // Tenant-scoped routes (path-based: /api/t/:slug/...). Order matters: the
  // more specific auth/public mounts must precede the catch-all tenant router.
  app.use('/api/t/:slug/auth', tenantAuthRoutes);
  app.use('/api/t/:slug/public', publicTenantRoutes);
  app.use('/api/t/:slug/public', payherePublicRoutes);
  app.use('/api/t/:slug/invites', inviteRoutes);
  app.use('/api/t/:slug/admin-invites', adminInviteRoutes);
  app.use('/api/t/:slug/join', classJoinRoutes);
  app.use('/api/t/:slug', tenantRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

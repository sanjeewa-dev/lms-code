import os from 'os';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const isProd = (process.env.NODE_ENV ?? 'development') === 'production';

const WEAK_SECRETS = new Set([
  'dev-access-secret',
  'dev-refresh-secret',
  'dev-watch-secret',
  'dev-cron-secret',
  'change-me-access-secret',
  'change-me-refresh-secret',
  'change-me-cron-secret',
  'change-me-watch-secret',
]);

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePositiveInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function defaultWebConcurrency(): number {
  if (process.env.NODE_ENV === 'test') return 1;
  if (isProd) return Math.min(8, Math.max(1, os.cpus().length || 1));
  return 1;
}

/** Fail closed in production on missing/weak/short secrets. */
function requireSecret(name: string, devFallback: string): string {
  const value = process.env[name] ?? (isProd ? undefined : devFallback);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  if (isProd && (WEAK_SECRETS.has(value) || value.length < 32)) {
    throw new Error(
      `${name} must be a strong secret (≥32 characters) and not a known default in production`
    );
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  /** Worker processes for `npm run start` / Docker. `npm run dev` stays 1 unless set. */
  webConcurrency: parsePositiveInt('WEB_CONCURRENCY', defaultWebConcurrency()),
  /** Reject extra requests with 503 once this many are in flight on one worker. */
  maxInFlightPerWorker: parsePositiveInt('MAX_IN_FLIGHT_PER_WORKER', 400),
  maxConnectionsPerWorker: parsePositiveInt('MAX_CONNECTIONS_PER_WORKER', 1000),
  prismaConnectionLimit: parsePositiveInt('PRISMA_CONNECTION_LIMIT', 25),
  /** In-flight Anthropic calls per worker; excess returns 503. */
  aiMaxConcurrent: parsePositiveInt('AI_MAX_CONCURRENT', 8),
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  jwt: {
    accessSecret: requireSecret('JWT_ACCESS_SECRET', 'dev-access-secret-local-only-not-for-prod!!'),
    refreshSecret: requireSecret('JWT_REFRESH_SECRET', 'dev-refresh-secret-local-only-not-for-prod!'),
    watchSecret: requireSecret('JWT_WATCH_SECRET', 'dev-watch-secret-local-only-not-for-prod!!!'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  uploadDir: path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads'),
  maxUploadBytes: parseInt(process.env.MAX_UPLOAD_MB ?? '25', 10) * 1024 * 1024,
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? 'Mindspark LMS <noreply@lms.local>',
  },
  apiPublicUrl: process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? '4000'}`,
  cronSecret: requireSecret('CRON_SECRET', 'dev-cron-secret-local-only-not-for-prod!!!!'),
  /** When true, PayHere checkout uses sandbox. Defaults to true outside production. */
  payhereSandbox:
    process.env.PAYHERE_SANDBOX !== undefined
      ? process.env.PAYHERE_SANDBOX === 'true'
      : !isProd,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  jitsi: {
    host: process.env.JITSI_HOST ?? 'meet.jit.si',
    appId: process.env.JITSI_APP_ID ?? '',
    appSecret: process.env.JITSI_APP_SECRET ?? '',
  },
  /** Teacher/admin AI calls per user per calendar month. */
  teacherAiMonthlyLimit: parseInt(process.env.TEACHER_AI_MONTHLY_LIMIT ?? '100', 10),
  nms: {
    /**
     * NMS origin or full communications URL.
     * Local default: http://localhost:8080 → POST /v1/communications
     * Shared/dev/prod: https://<nms-host> (same path).
     * Empty string disables dispatch (skip-safe).
     */
    baseUrl: (process.env.NMS_BASE_URL ?? (isProd ? '' : 'http://localhost:8080')).replace(
      /\/+$/,
      '',
    ),
    /** Shared with NMS `NMS_JWT_HS256_SECRET`. Empty = call local NMS without Bearer. */
    jwtHs256Secret: process.env.NMS_JWT_HS256_SECRET ?? '',
  },
};

// Keep `required` available for rare callers that need non-secret vars.
void required;

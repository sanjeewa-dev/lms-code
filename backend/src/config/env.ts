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
};

// Keep `required` available for rare callers that need non-secret vars.
void required;

import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { basePrisma } from '../lib/prisma';

export const NMS_MAX_RECEIVERS = 100;
const COMMUNICATIONS_PATH = '/v1/communications';

export type NmsReceiver = { name?: string; email: string };

/**
 * Local: http://localhost:8080 → http://localhost:8080/v1/communications
 * Shared/dev/prod: https://<nms-host> → https://<nms-host>/v1/communications
 * Also accepts the full path so env can be either origin or communications URL.
 */
export function resolveCommunicationsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed.endsWith(COMMUNICATIONS_PATH)) return trimmed;
  return `${trimmed}${COMMUNICATIONS_PATH}`;
}

export type DispatchCommunicationOpts = {
  tenantId: string;
  templateId: string;
  idempotencyKey: string;
  receivers: NmsReceiver[];
  header?: Record<string, unknown>;
  content?: Record<string, unknown>;
  footer?: Record<string, unknown>;
  relatedType?: string;
  relatedId?: string;
};

type CommunicationAccepted = {
  id?: string;
};

function mintServiceToken(tenantId: string): string | undefined {
  const secret = env.nms.jwtHs256Secret;
  if (!secret) return undefined;
  return jwt.sign(
    { sub: 'lms-service', tenantId, productCode: 'lms', typ: 'nms-service' },
    secret,
    { algorithm: 'HS256', expiresIn: '60s' },
  );
}

async function writeEmailLog(opts: {
  tenantId: string;
  to: string;
  subject: string;
  status: 'sent' | 'failed' | 'skipped';
  providerId?: string;
  error?: string;
  relatedType?: string;
  relatedId?: string;
}) {
  try {
    await basePrisma.emailLog.create({
      data: {
        tenantId: opts.tenantId,
        to: opts.to,
        subject: opts.subject,
        status: opts.status,
        providerId: opts.providerId,
        error: opts.error,
        relatedType: opts.relatedType,
        relatedId: opts.relatedId,
      },
    });
  } catch {
    /* ignore log failures */
  }
}

function subjectOf(opts: DispatchCommunicationOpts): string {
  const line = opts.header?.subjectLine;
  return typeof line === 'string' && line.length > 0 ? line : opts.templateId;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Fire-and-forget POST /v1/communications. Never throws after the LMS business write.
 * Does not log email bodies, tokens, or invite URLs.
 */
export async function dispatchCommunication(opts: DispatchCommunicationOpts): Promise<void> {
  const receivers = opts.receivers.filter((r) => r.email && r.email.includes('@'));
  if (receivers.length === 0) return;

  const subject = subjectOf(opts);
  const communicationsUrl = resolveCommunicationsUrl(env.nms.baseUrl);

  if (!communicationsUrl) {
    console.warn('[nms] NMS_BASE_URL is not configured; message was not sent');
    await Promise.all(
      receivers.map((r) =>
        writeEmailLog({
          tenantId: opts.tenantId,
          to: r.email,
          subject,
          status: 'skipped',
          error: 'NMS not configured',
          relatedType: opts.relatedType,
          relatedId: opts.relatedId,
        }),
      ),
    );
    return;
  }

  const token = mintServiceToken(opts.tenantId);
  const groups = chunk(receivers, NMS_MAX_RECEIVERS);

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const idempotencyKey =
      groups.length === 1 ? opts.idempotencyKey : `${opts.idempotencyKey}:c${i}`;
    const correlationId = randomUUID();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Idempotency-Key': idempotencyKey.slice(0, 256),
      'X-Correlation-Id': correlationId,
      'X-Product-Code': 'lms',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const body = {
      templateId: opts.templateId,
      header: opts.header,
      content: opts.content,
      footer: opts.footer,
      receiver: group.map((r) => ({ name: r.name, email: r.email })),
      channel: { email: true, sms: false },
    };

    console.log('[nms] POST', {
      url: communicationsUrl,
      templateId: opts.templateId,
      tenantId: opts.tenantId,
      receivers: group.length,
    });
    try {
      const res = await fetch(communicationsUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });

      if (res.status === 202 || res.status === 409) {
        let communicationId: string | undefined;
        try {
          const payload = (await res.json()) as CommunicationAccepted;
          communicationId = typeof payload.id === 'string' ? payload.id : undefined;
        } catch {
          /* ignore parse */
        }
        await Promise.all(
          group.map((r) =>
            writeEmailLog({
              tenantId: opts.tenantId,
              to: r.email,
              subject,
              status: 'sent',
              providerId: communicationId,
              relatedType: opts.relatedType,
              relatedId: opts.relatedId,
            }),
          ),
        );
        console.log('[nms] accepted', {
          templateId: opts.templateId,
          status: res.status,
          communicationId,
        });
        continue;
      }

      console.warn('[nms] request not accepted', {
        templateId: opts.templateId,
        status: res.status,
        tenantId: opts.tenantId,
      });
      await Promise.all(
        group.map((r) =>
          writeEmailLog({
            tenantId: opts.tenantId,
            to: r.email,
            subject,
            status: 'failed',
            error: `NMS HTTP ${res.status}`,
            relatedType: opts.relatedType,
            relatedId: opts.relatedId,
          }),
        ),
      );
    } catch (err) {
      console.warn('[nms] request failed', {
        templateId: opts.templateId,
        tenantId: opts.tenantId,
        error: err instanceof Error ? err.message : 'unknown',
      });
      await Promise.all(
        group.map((r) =>
          writeEmailLog({
            tenantId: opts.tenantId,
            to: r.email,
            subject,
            status: 'failed',
            error: err instanceof Error ? err.message : 'NMS unreachable',
            relatedType: opts.relatedType,
            relatedId: opts.relatedId,
          }),
        ),
      );
    }
  }
}

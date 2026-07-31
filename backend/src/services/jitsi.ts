import * as crypto from 'crypto';
import { env } from '../config/env';

/**
 * Generates a Jitsi Meet JWT token for secure room access.
 *
 * If JITSI_APP_ID / JITSI_APP_SECRET are not configured, returns null —
 * the room still works on public meet.jit.si but without moderator enforcement.
 */
export function makeJitsiToken(opts: {
  roomName: string;
  displayName: string;
  email: string;
  isModerator: boolean;
}): string | null {
  const appId = env.jitsi.appId;
  const appSecret = env.jitsi.appSecret;

  if (!appId || !appSecret) return null;

  const now = Math.floor(Date.now() / 1000);

  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: appId,
      aud: appId,
      sub: env.jitsi.host,
      room: opts.roomName,
      iat: now,
      exp: now + 60 * 60 * 4, // 4-hour token
      context: {
        user: {
          name: opts.displayName,
          email: opts.email,
          moderator: opts.isModerator,
        },
        features: {
          livestreaming: false,
          recording: opts.isModerator,
          'screen-sharing': true,
          'inbound-call': false,
          'outbound-call': false,
        },
      },
    })
  );

  const signature = crypto
    .createHmac('sha256', appSecret)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${header}.${payload}.${signature}`;
}

/** Generates a deterministic, URL-safe room name for a schedule entry. */
export function makeRoomName(tenantSlug: string, scheduleId: string): string {
  return `ms-${tenantSlug}-${scheduleId}`.replace(/[^a-zA-Z0-9-]/g, '-');
}

function base64url(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

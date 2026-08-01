import * as crypto from 'crypto';
import { env } from '../config/env';
import { badRequest } from '../utils/httpError';

/**
 * Generates a Jitsi Meet JWT token for secure room access.
 *
 * Development may use an unauthenticated room. Production requires Jitsi JWT
 * credentials so room membership and moderator permissions are enforced.
 */
export function makeJitsiToken(opts: {
  roomName: string;
  displayName: string;
  email: string;
  isModerator: boolean;
}): string | null {
  const appId = env.jitsi.appId;
  const appSecret = env.jitsi.appSecret;

  if (!appId || !appSecret) {
    if (env.nodeEnv === 'production') {
      throw badRequest('Jitsi credentials must be configured in production');
    }
    return null;
  }

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

/** Generates an unguessable room name for a schedule entry. */
export function makeRoomName(_tenantSlug: string, _scheduleId: string): string {
  return `ms-${crypto.randomBytes(12).toString('hex')}`;
}

function base64url(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

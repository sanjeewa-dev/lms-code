import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { Role } from '@prisma/client';

const JWT_ALG: jwt.Algorithm = 'HS256';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  email: string;
  name: string;
  tenantId: string | null;
  supportSessionId?: string;
  typ?: 'access';
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const { typ: _t, ...rest } = payload;
  return jwt.sign({ ...rest, typ: 'access' }, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpiresIn as jwt.SignOptions['expiresIn'],
    algorithm: JWT_ALG,
  });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, typ: 'refresh' }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'],
    algorithm: JWT_ALG,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, env.jwt.accessSecret, {
    algorithms: [JWT_ALG],
  }) as AccessTokenPayload & { typ?: string };

  if (payload.typ && payload.typ !== 'access') {
    throw new Error('Invalid token type');
  }
  if (!payload.role || !payload.sub) {
    throw new Error('Invalid access token claims');
  }
  return payload;
}

export function verifyRefreshToken(token: string): { sub: string } {
  const payload = jwt.verify(token, env.jwt.refreshSecret, {
    algorithms: [JWT_ALG],
  }) as { sub: string; typ?: string };
  if (payload.typ && payload.typ !== 'refresh') {
    throw new Error('Invalid token type');
  }
  if (!payload.sub) throw new Error('Invalid refresh token');
  return { sub: payload.sub };
}

export interface WatchTokenPayload {
  sub: string;
  videoId: string;
  tenantId: string;
  typ?: 'watch';
}

export function signWatchToken(payload: WatchTokenPayload): string {
  const { typ: _t, ...rest } = payload;
  return jwt.sign({ ...rest, typ: 'watch' }, env.jwt.watchSecret, {
    expiresIn: '4h',
    algorithm: JWT_ALG,
  });
}

export function verifyWatchToken(token: string): WatchTokenPayload {
  const payload = jwt.verify(token, env.jwt.watchSecret, {
    algorithms: [JWT_ALG],
  }) as WatchTokenPayload & { typ?: string };
  if (payload.typ && payload.typ !== 'watch') {
    throw new Error('Invalid token type');
  }
  if (!payload.sub || !payload.videoId || !payload.tenantId) {
    throw new Error('Invalid watch token claims');
  }
  return payload;
}

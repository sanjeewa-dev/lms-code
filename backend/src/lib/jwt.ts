import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { Role } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  email: string;
  name: string;
  tenantId: string | null;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwt.accessSecret) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, env.jwt.refreshSecret) as { sub: string };
}

export interface WatchTokenPayload {
  sub: string;
  videoId: string;
  tenantId: string;
}

export function signWatchToken(payload: WatchTokenPayload): string {
  return jwt.sign(payload, env.jwt.accessSecret, { expiresIn: '4h' });
}

export function verifyWatchToken(token: string): WatchTokenPayload {
  return jwt.verify(token, env.jwt.accessSecret) as WatchTokenPayload;
}

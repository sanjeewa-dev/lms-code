import type { AccessTokenPayload } from '../lib/jwt';
import type { Tenant } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
      tenant?: Tenant;
    }
  }
}

export {};

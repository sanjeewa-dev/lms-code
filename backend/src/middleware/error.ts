import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../utils/httpError';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'Route not found' });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.flatten(),
    });
  }

  if (err instanceof HttpError) {
    if (err.status === 503) {
      const retry =
        err.details && typeof err.details === 'object' && 'retryAfterSec' in err.details
          ? Number((err.details as { retryAfterSec?: number }).retryAfterSec)
          : 1;
      if (Number.isFinite(retry) && retry > 0) {
        res.setHeader('Retry-After', String(Math.ceil(retry)));
      }
    }
    return res.status(err.status).json({ error: err.message, details: err.details });
  }

  // Prisma unique constraint
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: string }).code;
    if (code === 'P2002') {
      return res.status(409).json({ error: 'Resource already exists' });
    }
    if (code === 'P2025') {
      return res.status(404).json({ error: 'Resource not found' });
    }
  }

  console.error('Unhandled error:', err);
  return res.status(500).json({ error: 'Internal server error' });
}

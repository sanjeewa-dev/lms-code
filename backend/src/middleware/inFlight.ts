import type { NextFunction, Request, Response } from 'express';

/**
 * Shed load with 503 instead of letting the event loop / Prisma pool stall until client timeout.
 */
export function inFlightLimiter(max: number) {
  let inFlight = 0;

  return function inFlightMiddleware(req: Request, res: Response, next: NextFunction) {
    const url = req.originalUrl || req.url || '';
    if (url.startsWith('/api/health')) {
      next();
      return;
    }

    if (inFlight >= max) {
      res.setHeader('Retry-After', '1');
      res.status(503).json({ error: 'Server busy. Retry shortly.' });
      return;
    }

    inFlight += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      inFlight = Math.max(0, inFlight - 1);
    };
    res.on('finish', release);
    res.on('close', release);
    next();
  };
}

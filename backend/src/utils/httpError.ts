export class HttpError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
    this.name = 'HttpError';
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);
export const unauthorized = (msg = 'Unauthorized') => new HttpError(401, msg);
export const forbidden = (msg = 'Forbidden') => new HttpError(403, msg);
export const notFound = (msg = 'Not found') => new HttpError(404, msg);
export const conflict = (msg: string) => new HttpError(409, msg);
export const paymentRequired = (msg: string, details?: unknown) => new HttpError(402, msg, details);
export const serviceUnavailable = (msg: string, retryAfterSec = 1) =>
  new HttpError(503, msg, { retryAfterSec });

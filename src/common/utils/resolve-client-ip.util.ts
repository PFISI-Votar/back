import type { Request } from 'express';

/**
 * Resolves the client IP for throttling and audit (respects X-Forwarded-For behind proxy).
 */
export const resolveClientIp = (request: Request): string => {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() ?? 'unknown';
  }
  return request.ip ?? 'unknown';
};

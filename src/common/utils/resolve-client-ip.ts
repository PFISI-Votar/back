import type { Request } from 'express';

/**
 * Resuelve la IP del cliente respetando proxies (X-Forwarded-For).
 * Usada por rate limiting y auditoría (VOTAR-394).
 */
export const resolveClientIp = (request: Request): string => {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() ?? 'unknown';
  }
  return request.ip ?? 'unknown';
};

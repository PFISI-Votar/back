import type { NextFunction, Request, Response } from 'express';
import { resolveClientIp } from '@/common/utils/resolve-client-ip';
import { InMemoryIpRateLimiter } from './in-memory-ip-rate-limiter';

export type GlobalRateLimitOptions = {
  windowMs: number;
  maxRequests: number;
  skipPaths?: string[];
};

const DEFAULT_SKIP_PATHS = ['/api/docs', '/api/docs-json', '/api/docs/'];

/**
 * Middleware global de rate limiting por IP (apiRouter / VOTAR-394).
 * Responde 429 + Retry-After cuando se supera el umbral.
 */
export const createGlobalRateLimitMiddleware = (
  options: GlobalRateLimitOptions,
) => {
  const limiter = new InMemoryIpRateLimiter(
    options.windowMs,
    options.maxRequests,
  );
  const skipPaths = options.skipPaths ?? DEFAULT_SKIP_PATHS;

  return (req: Request, res: Response, next: NextFunction): void => {
    const path = req.path ?? req.url ?? '/';
    if (
      skipPaths.some((prefix) => path === prefix || path.startsWith(prefix))
    ) {
      next();
      return;
    }

    const ip = resolveClientIp(req);
    const decision = limiter.consume(ip);
    if (!decision.allowed) {
      res.setHeader('Retry-After', String(decision.retryAfterSeconds));
      res.status(429).json({
        statusCode: 429,
        message: 'Demasiadas solicitudes. Intente nuevamente más tarde.',
        error: 'Too Many Requests',
      });
      return;
    }

    next();
  };
};

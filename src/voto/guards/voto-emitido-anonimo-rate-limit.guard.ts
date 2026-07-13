import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 30;

/**
 * Rate-limit in-memory for the anonymous vote audit endpoint.
 * Uses request IP only for throttling; never persisted to audit_log (VOTAR-379).
 */
@Injectable()
export class VotoEmitidoAnonimoRateLimitGuard implements CanActivate {
  private readonly attempts = new Map<string, number[]>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const key = request.ip ?? 'unknown';
    const now = Date.now();
    const recentAttempts = (this.attempts.get(key) ?? []).filter(
      (timestamp) => now - timestamp < WINDOW_MS,
    );
    if (recentAttempts.length >= MAX_ATTEMPTS) {
      throw new HttpException(
        'Demasiados registros anónimos de voto. Intente nuevamente en un minuto.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recentAttempts.push(now);
    this.attempts.set(key, recentAttempts);
    return true;
  }
}

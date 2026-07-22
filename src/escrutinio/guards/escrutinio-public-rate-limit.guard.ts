import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 60;

/**
 * In-memory rate limit for public escrutinio reads (VOTAR-364).
 * IP is used only for throttling and is never persisted.
 */
@Injectable()
export class EscrutinioPublicRateLimitGuard implements CanActivate {
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
        'Demasiadas consultas de resultados. Intente nuevamente en un minuto.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recentAttempts.push(now);
    this.attempts.set(key, recentAttempts);
    return true;
  }
}

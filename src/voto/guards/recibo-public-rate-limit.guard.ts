import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 20;

/**
 * In-memory rate limit for public receipt verification/signing (VOTAR-360).
 * IP is used only for throttling and is never persisted.
 */
@Injectable()
export class ReciboPublicRateLimitGuard implements CanActivate {
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
        'Demasiadas verificaciones de recibo. Intente nuevamente en un minuto.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recentAttempts.push(now);
    this.attempts.set(key, recentAttempts);
    return true;
  }
}

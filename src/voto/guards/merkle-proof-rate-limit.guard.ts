import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { InMemoryIpRateLimiter } from '@/common/rate-limit/in-memory-ip-rate-limiter';
import { resolveClientIp } from '@/common/utils/resolve-client-ip';

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

@Injectable()
export class MerkleProofRateLimitGuard implements CanActivate {
  private readonly limiter = new InMemoryIpRateLimiter(WINDOW_MS, MAX_ATTEMPTS);

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const decision = this.limiter.consume(resolveClientIp(request));

    if (!decision.allowed) {
      response.setHeader('Retry-After', String(decision.retryAfterSeconds));
      throw new HttpException(
        'Demasiadas solicitudes de prueba Merkle. Intente nuevamente en un minuto.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}

import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { VotanteRequest } from '@/voto/guards/votante-session.guard';

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

@Injectable()
export class VotoRateLimitGuard implements CanActivate {
  private readonly attempts = new Map<string, number[]>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<VotanteRequest>();
    const idEleccion = String(request.params.idEleccion);
    const votanteHash = request.votanteHash ?? request.ip ?? 'anonimo';
    const key = `${idEleccion}:${votanteHash}`;
    const now = Date.now();
    const recentAttempts = (this.attempts.get(key) ?? []).filter(
      (timestamp) => now - timestamp < WINDOW_MS,
    );

    if (recentAttempts.length >= MAX_ATTEMPTS) {
      throw new HttpException(
        'Demasiados intentos de confirmación. Intente nuevamente en un minuto.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    recentAttempts.push(now);
    this.attempts.set(key, recentAttempts);
    return true;
  }
}

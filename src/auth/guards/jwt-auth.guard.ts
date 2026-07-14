import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import {
  classifyJwtRejection,
  JwtRejectionReason,
} from '@/auth/services/jwks.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly auditLogger: AuditLoggerService) {
    super();
  }

  handleRequest<TUser>(
    err: Error | null,
    user: TUser | false,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      const request = context.switchToHttp().getRequest<Request>();
      const reason = classifyJwtRejection(err, info);
      this.logJwtRejection(request, reason);
      throw err instanceof UnauthorizedException
        ? err
        : new UnauthorizedException('No autenticado');
    }
    return user;
  }

  private logJwtRejection(request: Request, reason: JwtRejectionReason): void {
    const endpoint = `${request.method} ${request.path}`;
    const ipOrigen = resolveClientIp(request);
    void this.auditLogger
      .logAccesoDenegado({
        actorId: 'anonymous',
        ipOrigen,
        endpoint,
        timestamp: new Date(),
        datosAdicionales: { reason, guard: 'jwt' },
      })
      .catch(() => undefined);
  }
}

export const resolveClientIp = (request: Request): string => {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() ?? 'unknown';
  }
  return request.ip ?? 'unknown';
};

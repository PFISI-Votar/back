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
import { resolveClientIp } from '@/common/utils/resolve-client-ip';

export { resolveClientIp } from '@/common/utils/resolve-client-ip';

type RequestWithPendingAudit = Request & {
  pendingAuditLog?: Promise<unknown>;
};

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly auditLogger: AuditLoggerService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithPendingAudit>();
    try {
      return (await super.canActivate(context)) as boolean;
    } finally {
      // VOTAR-370: await para que el e2e vea la entrada encadenada antes del assert
      if (request.pendingAuditLog) {
        await request.pendingAuditLog.catch(() => undefined);
      }
    }
  }

  handleRequest<TUser>(
    err: Error | null,
    user: TUser | false,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      const request = context
        .switchToHttp()
        .getRequest<RequestWithPendingAudit>();
      const reason = classifyJwtRejection(err, info);
      this.logJwtRejection(request, reason);
      throw err instanceof UnauthorizedException
        ? err
        : new UnauthorizedException('No autenticado');
    }
    return user;
  }

  private logJwtRejection(
    request: RequestWithPendingAudit,
    reason: JwtRejectionReason,
  ): void {
    const endpoint = `${request.method} ${request.path}`;
    const ipOrigen = resolveClientIp(request);
    request.pendingAuditLog = this.auditLogger.logAccesoDenegado({
      actorId: 'anonymous',
      ipOrigen,
      endpoint,
      timestamp: new Date(),
      datosAdicionales: { reason, guard: 'jwt' },
    });
  }
}

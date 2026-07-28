import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@/auth/decorators/roles.decorator';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { AuthenticatedRequest } from '@/auth/interfaces/authenticated-request.interface';
import { AuditLoggerService } from '@/audit/audit-logger.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<JwtRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Acceso denegado');
    }
    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      await this.logAccesoDenegado(request, user.sub, user.role);
      throw new ForbiddenException('Acceso denegado');
    }
    return true;
  }

  private async logAccesoDenegado(
    request: AuthenticatedRequest,
    actorId: string,
    role: JwtRole,
  ): Promise<void> {
    const endpoint = `${request.method} ${request.path}`;
    const ipOrigen = this.resolveClientIp(request);
    try {
      await this.auditLogger.logAccesoDenegado({
        actorId,
        ipOrigen,
        endpoint,
        timestamp: new Date(),
        datosAdicionales: { role },
      });
    } catch {
      // No bloquear la respuesta 403 si falla la auditoría
    }
  }

  private resolveClientIp(request: AuthenticatedRequest): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0]?.trim() ?? 'unknown';
    }
    return request.ip ?? 'unknown';
  }
}

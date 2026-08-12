import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutoridadElectoral } from '@/auth/entities/autoridad-electoral.entity';
import { RolAutoridad } from '@/auth/enums/rol-autoridad.enum';
import { AuthenticatedRequest } from '@/auth/interfaces/authenticated-request.interface';
import { AuditLoggerService } from '@/audit/audit-logger.service';

/**
 * VOTAR-347 — además de `JwtRole.ELECTION_ADMIN` (ya exigido por `@AdminAuth()`),
 * requiere que la cuenta autenticada esté explícitamente marcada `RolAutoridad.PAUSER`
 * en `autoridad_electoral`. Le da uso real a un enum que antes era solo scaffolding:
 * no cualquier ELECTION_ADMIN puede solicitar/confirmar una pausa de emergencia.
 */
@Injectable()
export class PauserRoleGuard implements CanActivate {
  constructor(
    @InjectRepository(AutoridadElectoral)
    private readonly autoridadRepository: Repository<AutoridadElectoral>,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Acceso denegado');
    }

    const autoridad = await this.autoridadRepository.findOne({
      where: { identificadorSso: user.sub },
    });

    if (!autoridad || autoridad.rol !== RolAutoridad.PAUSER) {
      await this.logAccesoDenegado(request, user.sub);
      throw new ForbiddenException(
        'Esta cuenta no tiene el rol PAUSER requerido para pausar/reanudar comicios.',
      );
    }

    return true;
  }

  private async logAccesoDenegado(
    request: AuthenticatedRequest,
    actorId: string,
  ): Promise<void> {
    const endpoint = `${request.method} ${request.path}`;
    const ipOrigen = this.resolveClientIp(request);
    try {
      await this.auditLogger.logAccesoDenegado({
        actorId,
        ipOrigen,
        endpoint,
        timestamp: new Date(),
        datosAdicionales: { rolRequerido: RolAutoridad.PAUSER },
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

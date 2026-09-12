import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import { AdminAuth } from '@/auth/decorators/admin-auth.decorator';
import { PauserAuth } from '@/auth/decorators/pauser-auth.decorator';
import {
  RevocacionResultadoDto,
  RevocarSesionesUsuarioDto,
  RevocarTodasSesionesDto,
  SesionActivaDto,
} from '@/auth/dto/session-admin.dto';
import { RevocacionMotivo } from '@/auth/enums/revocacion-motivo.enum';
import type { AuthenticatedRequest } from '@/auth/interfaces/authenticated-request.interface';
import { RefreshTokenService } from '@/auth/services/refresh-token.service';
import { assertAuthenticatedUser } from '@/auth/strategies/jwt.strategy';
import { resolveClientIp } from '@/common/utils/resolve-client-ip.util';

/**
 * VOTAR-492 §12.2 (Plan de respuesta a incidentes — Contención). Operación
 * administrativa para revocar sesiones de refresh activas:
 * - listar y cerrar las propias: cualquier `ELECTION_ADMIN`.
 * - revocar por usuario / global: solo rol `PAUSER` (misma capacidad de
 *   contención que la pausa de emergencia, VOTAR-347).
 */
@ApiTags('auth-sessions')
@Controller('auth/sessions')
export class SessionAdminController {
  constructor(
    private readonly refreshTokenService: RefreshTokenService,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  @Get()
  @AdminAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Listar las sesiones de refresh activas de autoridades electorales',
  })
  @ApiResponse({ status: 200, type: SesionActivaDto, isArray: true })
  async listar(
    @Req() request: AuthenticatedRequest,
  ): Promise<SesionActivaDto[]> {
    const user = assertAuthenticatedUser(request.user);
    const sesiones = await this.refreshTokenService.listActiveSessions();
    return sesiones.map((sesion) => ({
      idSession: sesion.idSession,
      identificadorSso: sesion.identificadorSso,
      sub: sesion.sub,
      email: sesion.email,
      nombre: sesion.nombre,
      createdAt: sesion.createdAt.toISOString(),
      lastActivityAt: sesion.lastActivityAt.toISOString(),
      expiresAt: sesion.expiresAt.toISOString(),
      actual: sesion.idSession === user.sid,
    }));
  }

  @Delete('otras')
  @AdminAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Cerrar todas las sesiones propias excepto la actual (contención básica de la propia cuenta)',
  })
  @ApiResponse({ status: 200, type: RevocacionResultadoDto })
  async cerrarOtras(
    @Req() request: AuthenticatedRequest,
  ): Promise<RevocacionResultadoDto> {
    const user = assertAuthenticatedUser(request.user);
    const sesionesRevocadas =
      await this.refreshTokenService.revokeSessionsByUser({
        sub: user.sub,
        identificadorSso: user.sub,
        motivo: RevocacionMotivo.CIERRE_OTRAS_SESIONES,
        exceptIdSession: user.sid,
      });
    await this.auditLogger.logSesionRevocada({
      actorId: user.sub,
      alcance: 'PROPIA',
      sesionesRevocadas,
      motivo: 'El usuario cerró sus otras sesiones activas',
      endpoint: 'DELETE /auth/sessions/otras',
      timestamp: new Date(),
      ipOrigen: resolveClientIp(request),
    });
    return { sesionesRevocadas, alcance: 'PROPIA' };
  }

  @Post('revocar')
  @PauserAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Revocar todas las sesiones activas de un usuario (contención de incidente, rol PAUSER)',
  })
  @ApiResponse({ status: 200, type: RevocacionResultadoDto })
  @ApiResponse({ status: 400, description: 'Motivo inválido' })
  async revocarPorUsuario(
    @Body() dto: RevocarSesionesUsuarioDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<RevocacionResultadoDto> {
    const user = assertAuthenticatedUser(request.user);
    const sesionesRevocadas =
      await this.refreshTokenService.revokeSessionsByUser({
        identificadorSso: dto.identificadorSso,
        sub: dto.identificadorSso,
        motivo: RevocacionMotivo.REVOCACION_ADMIN,
      });
    await this.auditLogger.logSesionRevocada({
      actorId: user.sub,
      alcance: 'USUARIO',
      objetivo: dto.identificadorSso,
      sesionesRevocadas,
      motivo: dto.motivo,
      endpoint: 'POST /auth/sessions/revocar',
      timestamp: new Date(),
      ipOrigen: resolveClientIp(request),
    });
    // Sin 404 si no había sesiones: evita que el endpoint funcione como oráculo
    // de enumeración de usuarios (mismo criterio que VotanteAuthService).
    return { sesionesRevocadas, alcance: 'USUARIO' };
  }

  @Post('revocar-todas')
  @PauserAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Revocación global de todas las sesiones activas (contención total, rol PAUSER)',
  })
  @ApiResponse({ status: 200, type: RevocacionResultadoDto })
  @ApiResponse({
    status: 400,
    description: 'Confirmación o motivo inválidos (cero sesiones revocadas)',
  })
  async revocarTodas(
    @Body() dto: RevocarTodasSesionesDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<RevocacionResultadoDto> {
    const user = assertAuthenticatedUser(request.user);
    const preservar = dto.preservarSesionActual !== false;
    const sesionesRevocadas = await this.refreshTokenService.revokeAllSessions(
      RevocacionMotivo.REVOCACION_GLOBAL,
      preservar ? user.sid : undefined,
    );
    await this.auditLogger.logSesionRevocada({
      actorId: user.sub,
      alcance: 'GLOBAL',
      sesionesRevocadas,
      motivo: dto.motivo,
      endpoint: 'POST /auth/sessions/revocar-todas',
      timestamp: new Date(),
      ipOrigen: resolveClientIp(request),
    });
    return { sesionesRevocadas, alcance: 'GLOBAL' };
  }
}

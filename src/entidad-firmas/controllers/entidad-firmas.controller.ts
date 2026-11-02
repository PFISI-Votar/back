import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '@/auth/decorators/roles.decorator';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { VoterElectionGuard } from '@/auth/guards/voter-election.guard';
import { VoterJwtAuthGuard } from '@/auth/guards/voter-jwt-auth.guard';
import type { VoterAuthenticatedRequest } from '@/auth/interfaces/voter-authenticated-request.interface';
import { resolveClientIp } from '@/common/utils/resolve-client-ip.util';
import { IpRateLimitGuard } from '@/common/rate-limit/ip-rate-limit.guard';
import { RateLimit } from '@/common/rate-limit/rate-limit.decorator';
import { RateLimitTier } from '@/common/rate-limit/rate-limit-tier.enum';
import { CredencialEmitidaResponseDto } from '@/entidad-firmas/dto/credencial-emitida-response.dto';
import { EmitirCredencialDto } from '@/entidad-firmas/dto/emitir-credencial.dto';
import { CredencialValidacionService } from '@/entidad-firmas/services/credencial-validacion.service';

/**
 * VOTAR-377 FASE 1 (autenticada) — la "Entidad de Firmas Digitales" valida la
 * pertenencia al padrón del votante del JWT y registra el compromiso de una
 * credencial anónima de un solo uso. Esta llamada NO recibe la selección del voto.
 */
@ApiTags('validacion')
@ApiBearerAuth()
@Controller('elecciones/:idEleccion/validacion')
@UseGuards(VoterJwtAuthGuard, RolesGuard, VoterElectionGuard)
@Roles(JwtRole.VOTER)
export class EntidadFirmasController {
  constructor(
    private readonly credencialService: CredencialValidacionService,
  ) {}

  @Post('credencial')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(IpRateLimitGuard)
  @RateLimit({
    tier: RateLimitTier.VOTE,
    bucket: 'validacion-credencial',
    message:
      'Demasiadas solicitudes de credencial de validación. Intente nuevamente en un minuto.',
  })
  @ApiOperation({
    summary:
      'Emitir credencial de validación anónima (VOTAR-377, FASE 1 autenticada)',
    description:
      'Verifica que el votante autenticado (JWT) pertenece al padrón habilitado y registra keccak256(secreto). No recibe ni observa la selección partidaria (Blind Signing, AC-3).',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 201, type: CredencialEmitidaResponseDto })
  @ApiResponse({ status: 400, description: 'commit con formato inválido' })
  @ApiResponse({ status: 401, description: 'JWT inválido o expirado' })
  @ApiResponse({
    status: 403,
    description: 'Comicio no ABIERTA o votante no habilitado en el padrón',
  })
  @ApiResponse({
    status: 409,
    description:
      'commit ya registrado o tope de credenciales por votante alcanzado',
  })
  @ApiResponse({ status: 404, description: 'Comicio no encontrado' })
  @ApiResponse({ status: 429, description: 'Rate limit excedido' })
  async emitirCredencial(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Req() request: VoterAuthenticatedRequest,
    @Body() dto: EmitirCredencialDto,
  ): Promise<CredencialEmitidaResponseDto> {
    const { expiraEn } = await this.credencialService.emitir(
      idEleccion,
      request.user.votanteHash,
      dto.commit,
      resolveClientIp(request),
    );
    return { expiraEn: expiraEn.toISOString() };
  }
}

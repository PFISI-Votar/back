import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IpRateLimitGuard } from '@/common/rate-limit/ip-rate-limit.guard';
import { RateLimit } from '@/common/rate-limit/rate-limit.decorator';
import { RateLimitTier } from '@/common/rate-limit/rate-limit-tier.enum';
import { ClavePublicaValidadorResponseDto } from '@/entidad-firmas/dto/clave-publica-validador-response.dto';
import { FirmaValidacionResponseDto } from '@/entidad-firmas/dto/firma-validacion-response.dto';
import { SolicitarFirmaValidacionDto } from '@/entidad-firmas/dto/solicitar-firma-validacion.dto';
import { EntidadFirmasService } from '@/entidad-firmas/services/entidad-firmas.service';

/**
 * VOTAR-377 FASE 2 (anónima) — sin JWT ni cookie. El cliente revela el secreto de
 * la credencial junto con la totalidad del payload del sufragio; el backend
 * certifica "un integrante del padrón votó" sin poder vincular identidad ↔
 * selección (AC-3, Blind Signing).
 */
@ApiTags('validacion')
@Controller('validacion')
@UseGuards(IpRateLimitGuard)
export class EntidadFirmasPublicController {
  constructor(private readonly entidadFirmasService: EntidadFirmasService) {}

  @Get('clave-publica')
  @RateLimit({
    tier: RateLimitTier.PUBLIC,
    bucket: 'validacion-clave-publica',
    maxAttempts: 20,
    windowMs: 60_000,
  })
  @ApiOperation({
    summary: 'Clave pública de la Entidad de Firmas Digitales (VOTAR-377)',
  })
  @ApiResponse({ status: 200, type: ClavePublicaValidadorResponseDto })
  @ApiResponse({ status: 503, description: 'Entidad de Firmas no configurada' })
  obtenerClavePublica(): ClavePublicaValidadorResponseDto {
    return this.entidadFirmasService.obtenerClavePublica();
  }

  @Post('elecciones/:idEleccion/firma')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({
    tier: RateLimitTier.VOTE,
    bucket: 'validacion-firma',
    message:
      'Demasiadas solicitudes de firma de validación. Intente nuevamente en un minuto.',
  })
  @ApiOperation({
    summary:
      'Certificar un sufragio con la firma institucional (VOTAR-377, FASE 2 anónima)',
    description:
      'Canjea el secreto de la credencial (uso único) por una firma EIP-712 `Validation` sobre la totalidad del payload (AC-5). Llamada anónima: sin cookie ni JWT (AC-3).',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 201, type: FirmaValidacionResponseDto })
  @ApiResponse({ status: 400, description: 'Payload con formato inválido' })
  @ApiResponse({
    status: 410,
    description: 'Credencial inválida, vencida o ya utilizada',
  })
  @ApiResponse({ status: 422, description: 'Datos del payload inconsistentes' })
  @ApiResponse({ status: 429, description: 'Rate limit excedido' })
  @ApiResponse({
    status: 503,
    description: 'Entidad de Firmas o RPC no configurados',
  })
  certificarSufragio(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Body() dto: SolicitarFirmaValidacionDto,
  ): Promise<FirmaValidacionResponseDto> {
    return this.entidadFirmasService.certificarSufragio(idEleccion, dto);
  }
}

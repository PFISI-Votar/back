import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IpRateLimitGuard } from '@/common/rate-limit/ip-rate-limit.guard';
import { RateLimit } from '@/common/rate-limit/rate-limit.decorator';
import { RateLimitTier } from '@/common/rate-limit/rate-limit-tier.enum';
import { ContratoEstadoPublicaResponseDto } from '@/dashboard-publico/dto/contrato-estado-publica-response.dto';
import { ContratoEstadoPublicService } from '@/dashboard-publico/services/contrato-estado-public.service';

@ApiTags('dashboard-publico')
@Controller('elecciones/:idEleccion')
export class ContratoEstadoPublicController {
  constructor(
    private readonly contratoEstadoPublicService: ContratoEstadoPublicService,
  ) {}

  @Get('contrato-estado-publica')
  @UseGuards(IpRateLimitGuard)
  @RateLimit({
    tier: RateLimitTier.PUBLIC,
    bucket: 'contrato-estado-publica',
    maxAttempts: 20,
    windowMs: 60_000,
    message:
      'Demasiadas consultas al estado del contrato. Intente nuevamente en un minuto.',
  })
  @ApiOperation({
    summary: 'Metadatos técnicos del contrato electoral (VOTAR-367)',
    description:
      'Expone direcciones verificadas, estado operativo on-chain, raíz Merkle y límites de re-voto. Sin autenticación.',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Ficha técnica del smart contract del comicio',
    type: ContratoEstadoPublicaResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Comicio no encontrado' })
  @ApiResponse({
    status: 422,
    description: 'Comicio sin contratos desplegados on-chain',
  })
  @ApiResponse({ status: 429, description: 'Rate limit excedido' })
  @ApiResponse({
    status: 503,
    description: 'RPC o ElectionFactory no disponibles',
  })
  obtenerContratoEstadoPublica(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<ContratoEstadoPublicaResponseDto> {
    return this.contratoEstadoPublicService.obtenerContratoEstadoPublica(
      idEleccion,
    );
  }
}

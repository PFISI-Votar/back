import {
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IpRateLimitGuard } from '@/common/rate-limit/ip-rate-limit.guard';
import { RateLimit } from '@/common/rate-limit/rate-limit.decorator';
import { RateLimitTier } from '@/common/rate-limit/rate-limit-tier.enum';
import { SeccionDashboardTag } from '@/dashboard-publico/decorators/seccion-dashboard.decorator';
import { SeccionDashboardVisibleGuard } from '@/dashboard-publico/guards/seccion-dashboard-visible.guard';
import { SeccionDashboard } from '@/eleccion/configuracion-comicio/constants/visibilidad-dashboard.constants';
import { EscrutinioResponseDto } from '@/escrutinio/dto/escrutinio-response.dto';
import { EscrutinioService } from '@/escrutinio/services/escrutinio.service';

@ApiTags('escrutinio')
@Controller('elecciones/:idEleccion')
@UseGuards(IpRateLimitGuard)
@RateLimit({
  tier: RateLimitTier.PUBLIC,
  bucket: 'escrutinio-public',
  message:
    'Demasiadas consultas de resultados. Intente nuevamente en un minuto.',
})
export class EscrutinioPublicController {
  constructor(private readonly escrutinioService: EscrutinioService) {}

  /**
   * VOTAR-364: public provisional/final escrutinio tallies for the Dashboard.
   * Served from in-memory cache populated by the on-chain poller (UAT-02).
   */
  @Get('resultados')
  @UseGuards(SeccionDashboardVisibleGuard)
  @SeccionDashboardTag(SeccionDashboard.RESULTADOS)
  @Header('Cache-Control', 'public, max-age=3')
  @ApiOperation({
    summary:
      'VOTAR-364: resultados del escrutinio (tallies on-chain + metadatos off-chain)',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Snapshot de resultados',
    type: EscrutinioResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Comicio no encontrado' })
  @ApiResponse({
    status: 403,
    description: 'Sección oculta por configuración del comicio (VOTAR-459)',
  })
  @ApiResponse({
    status: 422,
    description: 'Comicio aún no admite escrutinio público',
  })
  @ApiResponse({
    status: 503,
    description: 'AuditView / RPC no disponible',
  })
  @ApiResponse({ status: 429, description: 'Rate limit excedido' })
  obtenerResultados(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<EscrutinioResponseDto> {
    return this.escrutinioService.obtenerResultados(idEleccion);
  }
}

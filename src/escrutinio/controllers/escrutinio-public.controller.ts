import {
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { EscrutinioResponseDto } from '@/escrutinio/dto/escrutinio-response.dto';
import { EscrutinioPublicRateLimitGuard } from '@/escrutinio/guards/escrutinio-public-rate-limit.guard';
import { EscrutinioService } from '@/escrutinio/services/escrutinio.service';

@ApiTags('escrutinio')
@Controller('elecciones/:idEleccion')
@UseGuards(EscrutinioPublicRateLimitGuard)
export class EscrutinioPublicController {
  constructor(private readonly escrutinioService: EscrutinioService) {}

  /**
   * VOTAR-364: public provisional/final escrutinio tallies for the Dashboard.
   * Served from in-memory cache populated by the on-chain poller (UAT-02).
   */
  @Get('resultados')
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

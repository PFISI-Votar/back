import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RevotoStatsPublicaResponseDto } from '@/dashboard-publico/dto/revoto-stats-publica-response.dto';
import { RevotoStatsPublicService } from '@/dashboard-publico/services/revoto-stats-public.service';

@ApiTags('dashboard-publico')
@Controller('elecciones/:idEleccion')
export class RevotoStatsPublicController {
  constructor(
    private readonly revotoStatsPublicService: RevotoStatsPublicService,
  ) {}

  @Get('revoto-stats-publica')
  @ApiOperation({
    summary: 'Estadísticas públicas de re-voto (VOTAR-329)',
    description:
      'Agrega AuditViewContract.getRevoteStats + curva acumulativa de sobreescritura. Sin autenticación.',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiQuery({
    name: 'horas',
    required: false,
    type: Number,
    description: 'Ventana horaria de la curva (1-72, default 12)',
  })
  @ApiResponse({
    status: 200,
    description: 'Métricas agregadas de re-voto',
    type: RevotoStatsPublicaResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Comicio no encontrado' })
  @ApiResponse({
    status: 422,
    description: 'Comicio sin contratos desplegados on-chain',
  })
  @ApiResponse({
    status: 503,
    description: 'RPC o ElectionFactory no disponibles',
  })
  obtenerRevotoStatsPublica(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Query('horas') horasRaw?: string,
  ): Promise<RevotoStatsPublicaResponseDto> {
    const horas = horasRaw ? Number(horasRaw) : 12;
    const horasVentana = Number.isFinite(horas) ? horas : 12;
    return this.revotoStatsPublicService.obtenerRevotoStatsPublica(
      idEleccion,
      horasVentana,
    );
  }
}

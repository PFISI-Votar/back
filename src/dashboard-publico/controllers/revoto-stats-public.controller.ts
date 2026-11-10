import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SeccionDashboardTag } from '@/dashboard-publico/decorators/seccion-dashboard.decorator';
import { RevotoStatsPublicaResponseDto } from '@/dashboard-publico/dto/revoto-stats-publica-response.dto';
import { SeccionDashboardVisibleGuard } from '@/dashboard-publico/guards/seccion-dashboard-visible.guard';
import { RevotoStatsPublicService } from '@/dashboard-publico/services/revoto-stats-public.service';
import { SeccionDashboard } from '@/eleccion/configuracion-comicio/constants/visibilidad-dashboard.constants';

@ApiTags('dashboard-publico')
@Controller('elecciones/:idEleccion')
export class RevotoStatsPublicController {
  constructor(
    private readonly revotoStatsPublicService: RevotoStatsPublicService,
  ) {}

  @Get('revoto-stats-publica')
  @UseGuards(SeccionDashboardVisibleGuard)
  @SeccionDashboardTag(SeccionDashboard.REVOTO)
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
    status: 403,
    description: 'Sección oculta por configuración del comicio (VOTAR-459)',
  })
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

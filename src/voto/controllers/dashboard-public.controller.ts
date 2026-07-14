import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DashboardEscrutinioResponseDto } from '@/voto/dto/dashboard-escrutinio-response.dto';
import { DashboardPublicoService } from '@/voto/services/dashboard-publico.service';

@ApiTags('dashboard-publico')
@Controller('elecciones/:idEleccion/dashboard')
export class DashboardPublicController {
  constructor(
    private readonly dashboardPublicoService: DashboardPublicoService,
  ) {}

  @Get('escrutinio')
  @ApiOperation({
    summary:
      'Métricas públicas de escrutinio y resultados (acceso anónimo, VOTAR-315/350)',
    description:
      'Mientras el comicio está abierto expone votos fiscalizados y % de escrutinio. ' +
      'Cuando está cerrado/escrutado, agrega resultados según tipo de votación.',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, type: DashboardEscrutinioResponseDto })
  @ApiResponse({ status: 404, description: 'Comicio no encontrado' })
  @ApiResponse({
    status: 503,
    description: 'Consulta on-chain no configurada o no disponible',
  })
  obtenerEscrutinio(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<DashboardEscrutinioResponseDto> {
    return this.dashboardPublicoService.obtenerEscrutinio(idEleccion);
  }
}

import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ParticipacionPublicaResponseDto } from '@/dashboard-publico/dto/participacion-publica-response.dto';
import { ParticipacionPublicService } from '@/dashboard-publico/services/participacion-public.service';

@ApiTags('dashboard-publico')
@Controller('elecciones/:idEleccion')
export class ParticipacionPublicController {
  constructor(
    private readonly participacionPublicService: ParticipacionPublicService,
  ) {}

  @Get('participacion-publica')
  @ApiOperation({
    summary: 'Métricas públicas de participación electoral (VOTAR-365)',
    description:
      'Agrega padrón + AuditViewContract.getParticipationStats + curva VoteCast. Sin autenticación.',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiQuery({
    name: 'horas',
    required: false,
    type: Number,
    description: 'Ventana horaria de la curva temporal (1-72, default 12)',
  })
  @ApiResponse({
    status: 200,
    description: 'Métricas de participación agregadas',
    type: ParticipacionPublicaResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Comicio o padrón no encontrado' })
  @ApiResponse({
    status: 422,
    description: 'Comicio sin contratos desplegados on-chain',
  })
  @ApiResponse({
    status: 503,
    description: 'RPC o ElectionFactory no disponibles',
  })
  obtenerParticipacionPublica(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Query('horas') horasRaw?: string,
  ): Promise<ParticipacionPublicaResponseDto> {
    const horas = horasRaw ? Number(horasRaw) : 12;
    const horasVentana = Number.isFinite(horas) ? horas : 12;
    return this.participacionPublicService.obtenerParticipacionPublica(
      idEleccion,
      horasVentana,
    );
  }
}

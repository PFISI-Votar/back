import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BudConfigResponseDto } from '@/voto/dto/bud-config-response.dto';
import { VotoService } from '@/voto/services/voto.service';

@ApiTags('voto')
@Controller('elecciones/:idEleccion')
export class BudPublicController {
  constructor(private readonly votoService: VotoService) {}

  @Get('configuracion-bud')
  @ApiOperation({
    summary:
      'Obtener configuración pública de la BUD antes del login del votante',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, type: BudConfigResponseDto })
  @ApiResponse({ status: 404, description: 'Comicio no encontrado' })
  obtenerConfiguracionBud(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<BudConfigResponseDto> {
    return this.votoService.obtenerConfiguracionBud(idEleccion);
  }
}

import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PadronService } from '../padron.service';
import { TotalVotantesResponseDto } from '../dto/total-votantes-response.dto';

@ApiTags('padron')
@Controller('elecciones/:idEleccion')
export class PadronPublicController {
  constructor(private readonly padronService: PadronService) {}

  @Get('padron/total-votantes')
  @ApiOperation({
    summary:
      'Obtener el total de votantes habilitados del padrón consolidado (VOTAR-333)',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Total de votantes habilitados',
    type: TotalVotantesResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'La elección no tiene un padrón consolidado',
  })
  obtenerTotalVotantes(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<TotalVotantesResponseDto> {
    return this.padronService.obtenerTotalVotantesPublico(idEleccion);
  }
}

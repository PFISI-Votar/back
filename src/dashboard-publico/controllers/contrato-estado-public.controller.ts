import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ContratoEstadoPublicaResponseDto } from '@/dashboard-publico/dto/contrato-estado-publica-response.dto';
import { ContratoEstadoPublicService } from '@/dashboard-publico/services/contrato-estado-public.service';

@ApiTags('dashboard-publico')
@Controller('elecciones/:idEleccion')
export class ContratoEstadoPublicController {
  constructor(
    private readonly contratoEstadoPublicService: ContratoEstadoPublicService,
  ) {}

  @Get('contrato-estado-publica')
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

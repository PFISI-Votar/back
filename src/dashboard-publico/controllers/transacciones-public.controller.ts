import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TransaccionesPublicaResponseDto } from '@/dashboard-publico/dto/transacciones-publica-response.dto';
import { TransaccionesPublicService } from '@/dashboard-publico/services/transacciones-public.service';

@ApiTags('dashboard-publico')
@Controller('elecciones/:idEleccion')
export class TransaccionesPublicController {
  constructor(
    private readonly transaccionesPublicService: TransaccionesPublicService,
  ) {}

  @Get('transacciones-publica')
  @ApiOperation({
    summary: 'Historial on-chain auditable de transacciones (VOTAR-373)',
    description:
      'Lista cronológicamente las transacciones detectadas por el blockScanner en los contratos del comicio. Sin autenticación.',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Historial de transacciones blockchain del comicio',
    type: TransaccionesPublicaResponseDto,
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
  obtenerTransaccionesPublica(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<TransaccionesPublicaResponseDto> {
    return this.transaccionesPublicService.obtenerTransaccionesPublica(
      idEleccion,
    );
  }
}

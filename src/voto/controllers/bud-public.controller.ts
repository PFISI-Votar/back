import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BoletaDigitalResponseDto } from '@/voto/dto/boleta-digital-response.dto';
import { BudConfigResponseDto } from '@/voto/dto/bud-config-response.dto';
import { VotoEmitidoAnonimoResponseDto } from '@/voto/dto/voto-emitido-anonimo-response.dto';
import { VotoEmitidoAnonimoRateLimitGuard } from '@/voto/guards/voto-emitido-anonimo-rate-limit.guard';
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

  @Get('oferta-oficializada')
  @ApiOperation({
    summary:
      'Catálogo público de listas y candidatos oficializados (VOTAR-368)',
    description:
      'Endpoint público sin JWT. Devuelve categorías, agrupaciones políticas y candidatos con fotos solo cuando la boleta está PUBLICADA.',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, type: BoletaDigitalResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Comicio no encontrado u oferta no oficializada',
  })
  obtenerOfertaPublica(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<BoletaDigitalResponseDto> {
    return this.votoService.obtenerOfertaPublica(idEleccion);
  }

  @Post('votos/emitido-anonimo')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(VotoEmitidoAnonimoRateLimitGuard)
  @ApiOperation({
    summary:
      'Registrar evento anónimo VOTO_EMITIDO tras cast on-chain (VOTAR-379 UAT-05)',
    description:
      'Endpoint público sin JWT. Solo acepta idEleccion en la ruta. No recibe nullifier, txHash ni identidad; no persiste IP/UA/SessionID.',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 201, type: VotoEmitidoAnonimoResponseDto })
  @ApiResponse({ status: 403, description: 'Comicio no apto' })
  @ApiResponse({ status: 404, description: 'Comicio no encontrado' })
  @ApiResponse({ status: 429, description: 'Rate limit excedido' })
  registrarVotoEmitidoAnonimo(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<VotoEmitidoAnonimoResponseDto> {
    return this.votoService.registrarVotoEmitidoAnonimo(idEleccion);
  }
}

import {
  Body,
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
import { IpRateLimitGuard } from '@/common/rate-limit/ip-rate-limit.guard';
import { RateLimit } from '@/common/rate-limit/rate-limit.decorator';
import { RateLimitTier } from '@/common/rate-limit/rate-limit-tier.enum';
import { BoletaDigitalResponseDto } from '@/voto/dto/boleta-digital-response.dto';
import { BudConfigResponseDto } from '@/voto/dto/bud-config-response.dto';
import { VotoEmitidoAnonimoResponseDto } from '@/voto/dto/voto-emitido-anonimo-response.dto';
import {
  RegistrarTransaccionPublicaDto,
  RegistrarTransaccionPublicaResponseDto,
} from '@/voto/dto/registrar-transaccion-publica.dto';
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
  @UseGuards(IpRateLimitGuard)
  @RateLimit({
    tier: RateLimitTier.VOTE,
    bucket: 'voto-emitido-anonimo',
    maxAttempts: 30,
    windowMs: 60_000,
    message:
      'Demasiados registros anónimos de voto. Intente nuevamente en un minuto.',
  })
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

  @Post('votos/transaccion-publica')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(IpRateLimitGuard)
  @RateLimit({
    tier: RateLimitTier.VOTE,
    bucket: 'voto-transaccion-publica',
    maxAttempts: 30,
    windowMs: 60_000,
    message:
      'Demasiados registros de transacción pública. Intente nuevamente en un minuto.',
  })
  @ApiOperation({
    summary:
      'Indexar transacción on-chain de sufragio para dashboard público (VOTAR-373)',
    description:
      'Endpoint público sin JWT. Solo recibe txHash. Verifica SignedVoteCast on-chain sin persistir nullifier ni identidad.',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 201, type: RegistrarTransaccionPublicaResponseDto })
  @ApiResponse({ status: 403, description: 'Comicio no apto' })
  @ApiResponse({
    status: 404,
    description: 'Comicio o transacción no encontrada',
  })
  @ApiResponse({ status: 429, description: 'Rate limit excedido' })
  registrarTransaccionPublica(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Body() body: RegistrarTransaccionPublicaDto,
  ): Promise<RegistrarTransaccionPublicaResponseDto> {
    return this.votoService.registrarTransaccionPublica(
      idEleccion,
      body.txHash,
    );
  }
}

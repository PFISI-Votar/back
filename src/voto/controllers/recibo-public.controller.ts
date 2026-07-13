import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ClavePublicaReciboResponseDto,
  FirmarReciboDto,
  FirmarReciboResponseDto,
} from '@/voto/dto/firmar-recibo.dto';
import { VerificarReciboResponseDto } from '@/voto/dto/verificar-recibo-response.dto';
import { ReciboPublicRateLimitGuard } from '@/voto/guards/recibo-public-rate-limit.guard';
import { ReciboService } from '@/voto/services/recibo.service';

/**
 * Public cryptographic receipt endpoints (VOTAR-360).
 * No JWT. Never stores PDFs. Never returns vote content.
 */
@ApiTags('recibos')
@Controller('recibos')
@UseGuards(ReciboPublicRateLimitGuard)
export class ReciboPublicController {
  constructor(private readonly reciboService: ReciboService) {}

  @Get('clave-publica')
  @ApiOperation({
    summary: 'Clave pública del sistema de auditoría de recibos',
  })
  @ApiResponse({ status: 200, type: ClavePublicaReciboResponseDto })
  @ApiResponse({ status: 503, description: 'Firma no configurada' })
  obtenerClavePublica(): ClavePublicaReciboResponseDto {
    return this.reciboService.obtenerClavePublica();
  }

  @Get('verificar/:txHash')
  @ApiOperation({
    summary:
      'Verificar participación electoral por TransactionHash (sin revelar el voto)',
    description:
      'Consulta on-chain el evento SignedVoteCast. Confirma inclusión en bloque sin devolver selectionHash, nullifier ni identidad.',
  })
  @ApiParam({
    name: 'txHash',
    description: 'Hash de transacción Ethereum (0x + 64 hex)',
  })
  @ApiResponse({ status: 200, type: VerificarReciboResponseDto })
  @ApiResponse({ status: 400, description: 'Hash inválido' })
  @ApiResponse({ status: 404, description: 'Participación no encontrada' })
  @ApiResponse({ status: 429, description: 'Rate limit excedido' })
  @ApiResponse({ status: 503, description: 'RPC no disponible' })
  verificar(
    @Param('txHash') txHash: string,
  ): Promise<VerificarReciboResponseDto> {
    return this.reciboService.verificarPorTxHash(txHash);
  }

  @Post('firmar')
  @ApiOperation({
    summary:
      'Obtener FirmaDigital del sistema sobre los campos del recibo (sin almacenar PDF)',
  })
  @ApiResponse({ status: 201, type: FirmarReciboResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Datos inconsistentes con on-chain',
  })
  @ApiResponse({ status: 404, description: 'Transacción no encontrada' })
  @ApiResponse({ status: 429, description: 'Rate limit excedido' })
  @ApiResponse({ status: 503, description: 'Firma o RPC no configurados' })
  firmar(@Body() dto: FirmarReciboDto): Promise<FirmarReciboResponseDto> {
    return this.reciboService.firmarRecibo(dto);
  }
}

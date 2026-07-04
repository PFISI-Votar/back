import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { VotoConfirmacion } from '@/voto/entities/voto-confirmacion.entity';
import { VerificarReciboResponseDto } from '@/voto/dto/verificar-recibo-response.dto';

/**
 * VOTAR-360: Controlador público para verificación de recibos electorales.
 *
 * Este endpoint NO requiere autenticación para permitir verificación
 * independiente por auditores, fiscales y ciudadanos.
 */
@ApiTags('recibos')
@Controller('recibos')
export class ReciboController {
  constructor(
    @InjectRepository(VotoConfirmacion)
    private readonly votoConfirmacionRepository: Repository<VotoConfirmacion>,
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
  ) {}

  @Get('verificar/:codigo')
  @UseGuards(ThrottlerGuard) // Rate limiting: 5 req/min por IP (default)
  @ApiOperation({
    summary: 'Verificar recibo de participación electoral (público)',
    description:
      'Permite verificar la autenticidad de un comprobante de participación ' +
      'electoral mediante el código de verificación E2E. NO revela el voto ni ' +
      'la identidad del votante. Cumple UAT-01 y UAT-02 de VOTAR-360.',
  })
  @ApiParam({
    name: 'codigo',
    description: 'Código de verificación E2E (UUID)',
    example: 'a1b2c3d4-5678-90ab-cdef-1234567890ab',
  })
  @ApiResponse({
    status: 200,
    type: VerificarReciboResponseDto,
    description: 'Recibo verificado exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Código de verificación no encontrado',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit excedido (máx 5 req/min)',
  })
  async verificarRecibo(
    @Param('codigo') codigo: string,
  ): Promise<VerificarReciboResponseDto> {
    const confirmacion = await this.votoConfirmacionRepository.findOne({
      where: { codigoVerificacionE2E: codigo },
    });

    if (!confirmacion) {
      throw new NotFoundException(
        'Código de verificación no encontrado. Verifique que el código sea correcto.',
      );
    }

    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion: confirmacion.idEleccion },
    });

    if (!eleccion) {
      throw new NotFoundException('Elección asociada no encontrada');
    }

    // Construir URL del explorador de blockchain (Etherscan Sepolia)
    const urlExploradorBlockchain = confirmacion.txHash
      ? this.buildExplorerUrl(confirmacion.txHash)
      : undefined;

    return {
      idEleccion: confirmacion.idEleccion,
      nombreEleccion: eleccion.nombre,
      recibidoEn: confirmacion.recibidoEn,
      txHash: confirmacion.txHash,
      blockNumber: confirmacion.blockNumber,
      estadoTx: confirmacion.txStatus,
      urlExploradorBlockchain,
      contractAddress: confirmacion.contractAddress,
      comprobanteHash: confirmacion.comprobanteHash,
    };
  }

  /**
   * Construye URL del explorador de blockchain (Etherscan Sepolia testnet)
   */
  private buildExplorerUrl(txHash: string): string {
    return `https://sepolia.etherscan.io/tx/${txHash}`;
  }
}

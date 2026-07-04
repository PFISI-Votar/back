import { ApiProperty } from '@nestjs/swagger';

/**
 * VOTAR-360: DTO para respuesta de verificación de recibo electoral.
 *
 * Este DTO NO contiene información del voto ni identidad del votante.
 * Solo certifica la participación en la elección.
 */
export class VerificarReciboResponseDto {
  @ApiProperty({ description: 'ID de la elección' })
  idEleccion: number;

  @ApiProperty({ description: 'Nombre de la elección' })
  nombreEleccion: string;

  @ApiProperty({ description: 'Fecha y hora de recepción del voto' })
  recibidoEn: Date;

  @ApiProperty({
    description: 'Hash de la transacción blockchain',
    required: false,
  })
  txHash?: string;

  @ApiProperty({ description: 'Número de bloque blockchain', required: false })
  blockNumber?: number;

  @ApiProperty({
    description: 'Estado de la transacción',
    enum: ['PENDIENTE', 'CONFIRMADA', 'FALLIDA'],
    required: false,
  })
  estadoTx?: string;

  @ApiProperty({
    description: 'URL del explorador de blockchain (Etherscan)',
    required: false,
  })
  urlExploradorBlockchain?: string;

  @ApiProperty({
    description: 'Dirección del smart contract',
    required: false,
  })
  contractAddress?: string;

  @ApiProperty({ description: 'Hash del comprobante off-chain' })
  comprobanteHash: string;
}

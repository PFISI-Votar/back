import { ApiProperty } from '@nestjs/swagger';

/**
 * Public verification response (VOTAR-360).
 * Confirms participation in a block without revealing vote content.
 */
export class VerificarReciboResponseDto {
  @ApiProperty({ example: true })
  confirmado: boolean;

  @ApiProperty({ example: 7 })
  idEleccion: number;

  @ApiProperty({ example: 'Centro de Estudiantes 2026' })
  nombreEleccion: string;

  @ApiProperty({
    example:
      '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  })
  txHash: string;

  @ApiProperty({ example: 4582193 })
  blockNumber: number;

  @ApiProperty({ example: '2026-07-11T14:30:00.000Z' })
  timestamp: string;

  @ApiProperty({ example: '0x5FbDB2315678afecb367f032d93F642f64180aa3' })
  contractAddress: string;

  @ApiProperty({
    example:
      'https://sepolia.etherscan.io/tx/0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  })
  explorerUrl: string;

  @ApiProperty({ example: 'CONFIRMADA' })
  estadoTx: 'CONFIRMADA';

  @ApiProperty({
    example:
      'Su participación fue confirmada en el bloque 4582193. El contenido del sufragio no es revelado.',
  })
  mensaje: string;
}

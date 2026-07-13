import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsInt,
  IsOptional,
  Matches,
  IsArray,
} from 'class-validator';

/**
 * VOTAR-360: DTO para registrar voto después de transmisión a blockchain.
 *
 * Este endpoint es llamado por el frontend después de transmitir exitosamente
 * un voto firmado a la blockchain (flujo bud-voting-wizard).
 */
export class RegistrarVotoBlockchainDto {
  @ApiProperty({
    description: 'Hash de la transacción blockchain (0x...)',
    example:
      '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  })
  @IsString()
  @Matches(/^0x[0-9a-fA-F]{64}$/, {
    message: 'txHash debe ser un hash Ethereum válido (0x + 64 caracteres hex)',
  })
  txHash: string;

  @ApiProperty({
    description: 'Número de bloque donde se confirmó la transacción',
    example: 4582193,
  })
  @IsInt()
  blockNumber: number;

  @ApiProperty({
    description: 'Hash del nullifier para prevenir doble voto',
    example:
      '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  })
  @IsString()
  @Matches(/^0x[0-9a-fA-F]{64}$/)
  nullifier: string;

  @ApiProperty({
    description: 'Hash de la selección del voto (encriptado)',
    example:
      '0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba',
  })
  @IsString()
  @Matches(/^0x[0-9a-fA-F]{64}$/)
  selectionHash: string;

  @ApiProperty({
    description: 'Timestamp UNIX del voto (en milisegundos)',
    example: 1783899476000,
  })
  @IsInt()
  timestamp: number;

  @ApiProperty({
    description: 'Dirección del smart contract',
    example: '0xabcdef1234567890abcdef1234567890abcdef12',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^0x[0-9a-fA-F]{40}$/)
  contractAddress?: string;

  @ApiProperty({
    description: 'IDs de categorías seleccionadas (para auditoría off-chain)',
    example: [1, 2, 3],
    type: [Number],
  })
  @IsArray()
  @IsInt({ each: true })
  categorias: number[];
}

export class RegistrarVotoBlockchainResponseDto {
  @ApiProperty({
    description: 'ID de la elección',
    example: 7,
  })
  idEleccion: number;

  @ApiProperty({
    description: 'Estado del registro',
    example: 'RECIBIDO',
  })
  estado: string;

  @ApiProperty({
    description: 'Hash del comprobante (derivado del voto)',
  })
  comprobanteHash: string;

  @ApiProperty({
    description: 'Hash del payload (derivado del nullifier + selectionHash)',
  })
  payloadHash: string;

  @ApiProperty({
    description: 'Timestamp de recepción en el backend',
  })
  recibidoEn: string;

  @ApiProperty({
    description: 'Código de verificación E2E (UUID generado por el backend)',
    example: 'a1b2c3d4-5678-90ab-cdef-1234567890ab',
  })
  codigoVerificacionE2E: string;

  @ApiProperty({
    description: 'Hash de transacción blockchain',
  })
  txHash: string;

  @ApiProperty({
    description: 'Número de bloque',
  })
  blockNumber: number;

  @ApiProperty({
    description: 'Estado de la transacción',
    example: 'CONFIRMADA',
  })
  txStatus: string;

  @ApiProperty({
    description: 'Dirección del smart contract',
    required: false,
  })
  contractAddress?: string;
}

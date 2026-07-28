import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsISO8601, IsString, Matches, Min } from 'class-validator';
import { TX_HASH_REGEX } from '@/voto/lib/recibo-canonical';

export class FirmarReciboDto {
  @ApiProperty({ example: 7 })
  @IsInt()
  @Min(1)
  idEleccion: number;

  @ApiProperty({
    example:
      '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  })
  @IsString()
  @Matches(TX_HASH_REGEX, {
    message: 'txHash debe ser un hash Ethereum válido (0x + 64 hex)',
  })
  txHash: string;

  @ApiProperty({ example: 4582193 })
  @IsInt()
  @Min(0)
  blockNumber: number;

  @ApiProperty({
    description: 'Timestamp ISO 8601 mostrado en el PDF del recibo',
    example: '2026-07-11T14:30:00.000Z',
  })
  @IsISO8601()
  timestamp: string;
}

export class FirmarReciboResponseDto {
  @ApiProperty({ description: 'Firma ECDSA del sistema de auditoría (hex)' })
  firmaDigital: string;

  @ApiProperty({ example: 'ECDSA_SECP256K1_SHA256' })
  algoritmo: string;

  @ApiProperty({ description: 'Dirección Ethereum de la clave pública' })
  clavePublica: string;

  @ApiProperty({ description: 'Payload canónico firmado' })
  payloadCanonico: string;
}

export class ClavePublicaReciboResponseDto {
  @ApiProperty({ example: 'ECDSA_SECP256K1_SHA256' })
  algoritmo: string;

  @ApiProperty({ description: 'Dirección Ethereum de la clave pública' })
  clavePublica: string;
}

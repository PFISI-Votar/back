import { ApiProperty } from '@nestjs/swagger';

/**
 * Hoja del padrón expuesta para auditoría/verificación. Sólo contiene el
 * hash Keccak-256 de la identidad y su índice dentro del Merkle Tree.
 */
export class PadronVotanteResponseDto {
  @ApiProperty({
    example: 0,
    description: 'Índice de la hoja en el Merkle Tree',
  })
  indiceHoja: number;

  @ApiProperty({
    example: 'a1b2c3…',
    description: 'Hash Keccak-256 de la identidad (64 hex)',
  })
  hashHoja: string;

  @ApiProperty({ description: 'Fecha de generación de la hoja' })
  generadoEn: Date;
}

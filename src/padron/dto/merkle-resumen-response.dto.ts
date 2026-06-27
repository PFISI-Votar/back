import { ApiProperty } from '@nestjs/swagger';
import { MerkleTreeEstado } from '../enums/merkle-tree-estado.enum';

export class MerkleResumenResponseDto {
  @ApiProperty({
    example:
      '0xa1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd',
    description: 'Raíz Merkle Keccak-256 del padrón (bytes32 con prefijo 0x)',
  })
  merkleRoot: string;

  @ApiProperty({
    example: 1000,
    description: 'Cantidad total de hojas en el árbol',
  })
  totalHojas: number;

  @ApiProperty({ example: 1, description: 'Versión del árbol Merkle' })
  version: number;

  @ApiProperty({ enum: MerkleTreeEstado, example: MerkleTreeEstado.GENERADO })
  estado: MerkleTreeEstado;

  @ApiProperty({ description: 'Fecha de generación del árbol Merkle' })
  fechaGeneracion: Date;
}

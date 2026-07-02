import { ApiProperty } from '@nestjs/swagger';

export class VoterMerkleProofResponseDto {
  @ApiProperty({
    type: [String],
    example: [
      '0x1111111111111111111111111111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222222222222222222222222222',
    ],
    description: 'Prueba de pertenencia Merkle (hashes hermanos, on-demand)',
  })
  merkleProof: string[];

  @ApiProperty({
    example:
      '0xa1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd',
    description: 'Raíz Merkle del comicio (bytes32 con prefijo 0x)',
  })
  root: string;
}

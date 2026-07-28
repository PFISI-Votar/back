import { ApiProperty } from '@nestjs/swagger';
import { MerkleTreeEstado } from '@/padron/enums/merkle-tree-estado.enum';

export class PublicarMerkleResponseDto {
  @ApiProperty({ example: 42 })
  electionId: number;

  @ApiProperty({
    example:
      '0xa1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd',
  })
  merkleRoot: string;

  @ApiProperty({
    enum: MerkleTreeEstado,
    example: MerkleTreeEstado.PUBLICADO_ON_CHAIN,
  })
  estado: MerkleTreeEstado;

  @ApiProperty({
    example:
      '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  })
  txHash: string;

  @ApiProperty({ example: 12345678 })
  blockNumber: number;

  @ApiProperty({ example: '0x55d1d115309872C16B9646362C82fFa246F3F652' })
  contractAddress: string;

  @ApiProperty({ example: 'https://sepolia.etherscan.io/tx/0x...' })
  explorerUrl: string;

  @ApiProperty()
  publishedAt: Date;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RedBlockchain } from '@/blockchain/enums/contrato-blockchain.enum';

/**
 * Public payload so the frontend can call ElectionFactory dynamically (VOTAR-337).
 */
export class ElectionFactoryContratoResponseDto {
  @ApiProperty({ example: '0x5FbDB2315678afecb367f032d93F642f64180aa3' })
  direccionContrato: string;

  @ApiProperty({
    description: 'ABI JSON del ElectionFactory',
    type: 'array',
    items: { type: 'object' },
  })
  abi: unknown[];

  @ApiProperty({ example: '0x' + 'a'.repeat(64) })
  abiHash: string;

  @ApiProperty({ enum: RedBlockchain })
  red: RedBlockchain;

  @ApiProperty({ example: 11155111 })
  chainId: number;

  @ApiProperty({ example: true })
  verificadoEtherscan: boolean;

  @ApiPropertyOptional({
    example: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  })
  merkleRootStoreAddress: string | null;

  @ApiPropertyOptional({
    example: '0x4852CB3d2acA0fDD4677a3e6dD1C2f3AcEFD6928',
  })
  adminAddress: string | null;

  @ApiPropertyOptional({
    example: '0x' + 'b'.repeat(64),
  })
  txHashDespliegue: string | null;

  @ApiPropertyOptional()
  fechaDespliegue: Date | null;
}

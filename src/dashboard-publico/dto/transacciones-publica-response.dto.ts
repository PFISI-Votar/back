import { ApiProperty } from '@nestjs/swagger';

export class TransaccionBlockchainPublicaDto {
  @ApiProperty({
    example:
      '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
  })
  hashTransaccion: string;

  @ApiProperty({ example: 4582193 })
  numeroBloque: number;

  @ApiProperty({ example: '2026-08-08T15:30:00.000Z' })
  marcaTiempo: string;

  @ApiProperty({ example: 'VoteRegistry' })
  contratoEtiqueta: string;

  @ApiProperty({ example: 'VoteCast' })
  nombreEvento: string;

  @ApiProperty({
    example: 'Sufragio contabilizado',
  })
  descripcionLegible: string;

  @ApiProperty({
    example:
      'https://sepolia.etherscan.io/tx/0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
  })
  explorerUrl: string;
}

export class TransaccionesPublicaResponseDto {
  @ApiProperty({ example: 7 })
  idEleccion: number;

  @ApiProperty({ example: false })
  snapshotCongelado: boolean;

  @ApiProperty({ example: 'Sepolia' })
  red: string;

  @ApiProperty({ example: 11155111 })
  chainId: number;

  @ApiProperty({ type: [TransaccionBlockchainPublicaDto] })
  transacciones: TransaccionBlockchainPublicaDto[];

  @ApiProperty({
    example: 'Índice append-only verificable on-chain (Etherscan)',
  })
  fuenteDatos: string;
}

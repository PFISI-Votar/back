import { ApiProperty } from '@nestjs/swagger';

export class ContratoDireccionPublicaDto {
  @ApiProperty({ example: '0x5FbDB2315678afecb367f032d93F642f64180aa3' })
  direccion: string;

  @ApiProperty({
    example:
      'https://sepolia.etherscan.io/address/0x5FbDB2315678afecb367f032d93F642f64180aa3',
  })
  explorerUrl: string;
}

export class EstadoOnChainPublicoDto {
  @ApiProperty({
    example: 2,
    description: 'Enum MerkleRootStore.ElectionState',
  })
  codigo: number;

  @ApiProperty({ example: 'ABIERTA' })
  etiqueta: string;
}

export class MerkleRootPublicoDto {
  @ApiProperty({
    example:
      '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
  })
  hash: string;

  @ApiProperty({ example: true })
  publicado: boolean;

  @ApiProperty({
    example: '2026-08-08T12:00:00.000Z',
    nullable: true,
  })
  publicadoEn: string | null;
}

export class LimitesRevotoPublicoDto {
  @ApiProperty({ example: true })
  habilitado: boolean;

  @ApiProperty({ example: 3 })
  maxVotosPorVotante: number;

  @ApiProperty({ example: 60 })
  minIntervaloSegundos: number;

  @ApiProperty({
    example: 'LAST_VOTE_WINS',
    enum: ['LAST_VOTE_WINS', 'DISABLED'],
  })
  politicaRevoto: 'LAST_VOTE_WINS' | 'DISABLED';
}

export class ContratosPublicosDto {
  @ApiProperty({ type: ContratoDireccionPublicaDto })
  ballot: ContratoDireccionPublicaDto;

  @ApiProperty({ type: ContratoDireccionPublicaDto })
  voteRegistry: ContratoDireccionPublicaDto;

  @ApiProperty({ type: ContratoDireccionPublicaDto })
  auditView: ContratoDireccionPublicaDto;

  @ApiProperty({ type: ContratoDireccionPublicaDto })
  merkleRootStore: ContratoDireccionPublicaDto;
}

export class ContratoEstadoPublicaResponseDto {
  @ApiProperty({ example: 7 })
  idEleccion: number;

  @ApiProperty({ example: false })
  snapshotCongelado: boolean;

  @ApiProperty({ example: 'Sepolia' })
  red: string;

  @ApiProperty({ example: 11155111 })
  chainId: number;

  @ApiProperty({ type: EstadoOnChainPublicoDto })
  estadoOnChain: EstadoOnChainPublicoDto;

  @ApiProperty({ type: MerkleRootPublicoDto })
  merkleRoot: MerkleRootPublicoDto;

  @ApiProperty({ type: LimitesRevotoPublicoDto })
  revoto: LimitesRevotoPublicoDto;

  @ApiProperty({ type: ContratosPublicosDto })
  contratos: ContratosPublicosDto;

  @ApiProperty({
    example:
      'AuditViewContract.getElectionState + MerkleRootStore.getMerkleRoot + ElectionFactory.getElection',
  })
  fuenteDatos: string;
}

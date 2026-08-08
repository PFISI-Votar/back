import { ApiProperty } from '@nestjs/swagger';

export class RevotoOverwriteTimelinePuntoDto {
  @ApiProperty({ example: '14:00' })
  etiqueta: string;

  @ApiProperty({ example: 0.3, description: 'Tasa acumulada de sobreescritura (0–1)' })
  overwriteRatio: number;

  @ApiProperty({ example: 30 })
  totalRevotes: number;

  @ApiProperty({ example: 100 })
  totalEventos: number;
}

export class RevotoStatsPublicaResponseDto {
  @ApiProperty({ example: 7 })
  idEleccion: number;

  @ApiProperty({ example: false })
  snapshotCongelado: boolean;

  @ApiProperty({ example: 30 })
  totalRevotes: number;

  @ApiProperty({ example: 70 })
  uniqueVoters: number;

  @ApiProperty({ example: 0.3, description: 'totalRevotes / (uniqueVoters + totalRevotes)' })
  overwriteRatio: number;

  @ApiProperty({ type: [RevotoOverwriteTimelinePuntoDto] })
  serieTemporal: RevotoOverwriteTimelinePuntoDto[];

  @ApiProperty({ example: 'AuditViewContract.getRevoteStats' })
  fuenteDatos: string;
}

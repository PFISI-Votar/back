import { ApiProperty } from '@nestjs/swagger';
import { DesgloseCategoriaDto } from './desglose-categoria.dto';
import { FormulaParticipacionDto } from './formula-participacion.dto';
import { SerieTemporalPuntoDto } from './serie-temporal.dto';

export class VerificacionTotalesDto {
  @ApiProperty({ example: true })
  coherente: boolean;

  @ApiProperty({ example: 25 })
  totalOnChain: number;

  @ApiProperty({ example: 25 })
  totalCalculado: number;
}

export class ParticipacionPublicaResponseDto {
  @ApiProperty({ example: 7 })
  idEleccion: number;

  @ApiProperty({ example: false })
  snapshotCongelado: boolean;

  @ApiProperty({ type: FormulaParticipacionDto })
  formula: FormulaParticipacionDto;

  @ApiProperty({ type: [SerieTemporalPuntoDto] })
  serieTemporal: SerieTemporalPuntoDto[];

  @ApiProperty({ type: [DesgloseCategoriaDto] })
  desglosePorCategoria: DesgloseCategoriaDto[];

  @ApiProperty({ type: VerificacionTotalesDto })
  verificacionTotales: VerificacionTotalesDto;

  @ApiProperty({
    example: 'AuditViewContract.getParticipationStats + VoteRegistry.VoteCast',
  })
  fuenteDatos: string;
}

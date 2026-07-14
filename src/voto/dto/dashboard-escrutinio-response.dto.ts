import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ParticipacionPublicaDto {
  @ApiProperty({
    description: 'Votos únicos fiscalizados on-chain (LAST_VOTE_WINS)',
  })
  votosFiscalizados: number;

  @ApiProperty()
  votosEnBlanco: number;

  @ApiProperty()
  votosNulos: number;

  @ApiProperty()
  totalVotantesHabilitados: number;

  @ApiProperty({
    description:
      'Porcentaje de escrutinio: votosFiscalizados / totalVotantesHabilitados * 100',
  })
  porcentajeEscrutinio: number;
}

export class ResultadoListaDto {
  @ApiProperty()
  idLista: number;

  @ApiProperty()
  nombre: string;

  @ApiProperty()
  sigla: string;

  @ApiPropertyOptional({ nullable: true })
  color: string | null;

  @ApiProperty()
  votos: number;

  @ApiProperty()
  porcentaje: number;
}

export class ResultadoCandidatoDto {
  @ApiProperty()
  idCandidato: number;

  @ApiProperty()
  nombre: string;

  @ApiProperty()
  apellido: string;

  @ApiProperty()
  idLista: number;

  @ApiProperty()
  nombreLista: string;

  @ApiProperty()
  idCategoria: number;

  @ApiProperty()
  nombreCategoria: string;

  @ApiProperty()
  votos: number;

  @ApiProperty()
  porcentaje: number;
}

export class ResultadosPublicosDto {
  @ApiPropertyOptional({ type: [ResultadoListaDto] })
  porLista?: ResultadoListaDto[];

  @ApiPropertyOptional({ type: [ResultadoCandidatoDto] })
  porCandidato?: ResultadoCandidatoDto[];

  @ApiProperty()
  votosEnBlanco: number;

  @ApiProperty()
  votosNulos: number;
}

export class DashboardEscrutinioResponseDto {
  @ApiProperty()
  idEleccion: number;

  @ApiProperty()
  estado: string;

  @ApiProperty()
  tipoVotacion: string;

  @ApiProperty({ type: ParticipacionPublicaDto })
  participacion: ParticipacionPublicaDto;

  @ApiPropertyOptional({
    type: ResultadosPublicosDto,
    nullable: true,
    description:
      'Resultados electorales según tipo de votación. Presente cuando el comicio está CERRADA/ESCRUTADA.',
  })
  resultados: ResultadosPublicosDto | null;
}

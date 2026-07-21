import { ApiProperty } from '@nestjs/swagger';

export class ParticipacionEscrutinioDto {
  @ApiProperty({
    example: 120,
    description: 'Votos únicos emitidos (LAST_VOTE_WINS no doble-cuenta)',
  })
  totalVotos: number;

  @ApiProperty({ example: 5, description: 'Tally de votos en blanco' })
  votosBlanco: number;

  @ApiProperty({ example: 2, description: 'Tally de votos nulos' })
  votosNulo: number;

  @ApiProperty({
    example: 1500,
    description: 'Total de votantes habilitados en el padrón',
  })
  totalVotantesHabilitados: number;

  @ApiProperty({
    example: 8.0,
    description: 'Porcentaje de participación (totalVotos / padrón * 100)',
  })
  porcentajeParticipacion: number;
}

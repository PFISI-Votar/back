import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PoliticaRevoto } from '@/eleccion/configuracion-comicio/enums/politica-revoto.enum';

export class EstadoRevotoResponseDto {
  @ApiProperty({
    description: 'True cuando el comicio admite re-voto (LAST_VOTE_WINS)',
  })
  revoteHabilitado: boolean;

  @ApiProperty({ example: 3 })
  maxVotosPorVotante: number;

  @ApiProperty({ example: 1 })
  votosConsumidos: number;

  @ApiProperty({
    example: 2,
    description: 'Intentos de sufragio aún disponibles para el votante',
  })
  intentosRestantes: number;

  @ApiProperty({
    description: 'False cuando se alcanzó el máximo de votos admitidos',
  })
  puedeVotar: boolean;

  @ApiProperty({ example: 0 })
  minIntervaloSegundos: number;

  @ApiPropertyOptional({
    description:
      'Segundos restantes hasta poder re-votar (si aplica intervalo mínimo)',
  })
  proximoReintentoEnSegundos?: number;

  @ApiProperty({ enum: PoliticaRevoto })
  politicaRevoto: PoliticaRevoto;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MetodoAutenticacion } from '@/eleccion/configuracion-comicio/enums/metodo-autenticacion.enum';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { TipoVotacion } from '@/eleccion/enums/tipo-votacion.enum';

export class BudConfigResponseDto {
  @ApiProperty()
  idEleccion!: number;

  @ApiProperty()
  nombre!: string;

  @ApiProperty({ enum: EleccionEstado })
  estado!: EleccionEstado;

  @ApiProperty({ enum: TipoVotacion })
  tipoVotacion!: TipoVotacion;

  @ApiProperty({ enum: MetodoAutenticacion, isArray: true })
  metodosAutenticacion!: MetodoAutenticacion[];

  @ApiProperty({
    description:
      'True cuando el comicio está CERRADA/ESCRUTADA (resultados definitivos e inmutables)',
  })
  resultadosDefinitivos!: boolean;

  @ApiProperty({
    description:
      'True cuando el Portal de Transparencia debe dejar de actualizar dinámicamente',
  })
  snapshotCongelado!: boolean;

  @ApiProperty({
    description:
      'VOTAR-447: si el comicio habilita voto nulo (y su recuento en el dashboard público)',
    example: true,
  })
  permitirVotoNulo!: boolean;

  @ApiProperty({
    description:
      'VOTAR-347 — true si la urna digital está pausada por incidente. La BUD debe bloquear el envío de votos mientras sea true.',
  })
  pausada!: boolean;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'VOTAR-454: observación configurable del login de la BUD. Null oculta el recuadro.',
  })
  observacionLogin!: string | null;
}

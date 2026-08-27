import { ApiProperty } from '@nestjs/swagger';
import { MetodoAutenticacion } from '@/eleccion/configuracion-comicio/enums/metodo-autenticacion.enum';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { TipoVotacion } from '@/eleccion/enums/tipo-votacion.enum';

export class VisibilidadDashboardPublicoDto {
  @ApiProperty({
    description: 'Solapa "Resultados" visible en el Dashboard Público',
  })
  resultados!: boolean;

  @ApiProperty({
    description: 'Solapa "Participación" visible en el Dashboard Público',
  })
  participacion!: boolean;

  @ApiProperty({
    description: 'Solapa "Re-voto" visible en el Dashboard Público',
  })
  revoto!: boolean;

  @ApiProperty({
    description: 'Solapa "Transacciones" visible en el Dashboard Público',
  })
  transacciones!: boolean;
}

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

  @ApiProperty({
    description:
      'VOTAR-459: solapas del dashboard público visibles mientras el comicio está en curso. Todas en true cuando el comicio cerró.',
    type: VisibilidadDashboardPublicoDto,
  })
  visibilidadDashboard!: VisibilidadDashboardPublicoDto;
}

import { ApiProperty } from '@nestjs/swagger';
import { TipoNovedad } from '../enums/tipo-novedad.enum';

/**
 * Registro de novedad de una fila omitida durante la importación del padrón.
 * No contiene datos identificatorios en texto plano (Ley 25.326): sólo el
 * número de línea físico del archivo y el motivo del descarte.
 */
export class NovedadPadronDto {
  @ApiProperty({
    example: 14,
    description:
      'Número de línea/fila físico del archivo CSV o Excel (la cabecera es 1)',
  })
  linea: number;

  @ApiProperty({ enum: TipoNovedad, example: TipoNovedad.DUPLICADO })
  tipo: TipoNovedad;

  @ApiProperty({
    example: 'Línea 14: Registro duplicado - Se preservó la primera aparición',
    description: 'Descripción legible del motivo del descarte',
  })
  motivo: string;
}

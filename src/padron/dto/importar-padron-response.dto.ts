import { ApiProperty } from '@nestjs/swagger';
import { PadronEstado } from '../enums/padron-estado.enum';
import { NovedadPadronDto } from './novedad-padron.dto';

export class ImportarPadronResponseDto {
  @ApiProperty({
    example: 1,
    nullable: true,
    description:
      'Identificador del padrón creado. null si no se persistió (0 identidades válidas).',
  })
  idPadron: number | null;

  @ApiProperty({
    example: 42,
    description: 'Elección a la que pertenece el padrón',
  })
  idEleccion: number;

  @ApiProperty({
    example: 105,
    description: 'Cantidad de filas de datos (no vacías) leídas del archivo',
  })
  totalProcesados: number;

  @ApiProperty({
    example: 100,
    description:
      'Cantidad de identidades únicas válidas hasheadas e importadas',
  })
  totalImportados: number;

  @ApiProperty({
    example: 5,
    description: 'Cantidad de filas omitidas (defectuosas o duplicadas)',
  })
  totalOmitidos: number;

  @ApiProperty({
    type: [NovedadPadronDto],
    description:
      'Registro de novedades: filas omitidas con su número de línea y motivo',
  })
  novedades: NovedadPadronDto[];

  @ApiProperty({
    enum: PadronEstado,
    example: PadronEstado.BORRADOR,
    nullable: true,
  })
  estado: PadronEstado | null;

  @ApiProperty({
    nullable: true,
    description: 'Fecha de generación del padrón (null si no se persistió)',
  })
  fechaGeneracion: Date | null;
}

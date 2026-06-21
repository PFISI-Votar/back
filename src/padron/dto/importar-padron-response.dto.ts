import { ApiProperty } from '@nestjs/swagger';
import { PadronEstado } from '../enums/padron-estado.enum';

export class ImportarPadronResponseDto {
  @ApiProperty({ example: 1, description: 'Identificador del padrón creado' })
  idPadron: number;

  @ApiProperty({
    example: 42,
    description: 'Elección a la que pertenece el padrón',
  })
  idEleccion: number;

  @ApiProperty({
    example: 1000,
    description: 'Cantidad de identidades hasheadas e importadas',
  })
  totalImportados: number;

  @ApiProperty({ enum: PadronEstado, example: PadronEstado.BORRADOR })
  estado: PadronEstado;

  @ApiProperty({ description: 'Fecha de generación del padrón' })
  fechaGeneracion: Date;
}

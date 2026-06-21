import { ApiProperty } from '@nestjs/swagger';
import { PadronEstado } from '../enums/padron-estado.enum';

/**
 * Resumen del padrón de un comicio. No expone datos personales:
 * la identidad de cada votante vive hasheada (Keccak-256) en PADRON_VOTANTE.
 */
export class PadronResumenResponseDto {
  @ApiProperty({ example: 1, description: 'Identificador del padrón' })
  idPadron: number;

  @ApiProperty({
    example: 42,
    description: 'Elección a la que pertenece el padrón',
  })
  idEleccion: number;

  @ApiProperty({
    example: 1000,
    description: 'Cantidad de identidades habilitadas en el padrón',
  })
  totalVotantesHabilitados: number;

  @ApiProperty({
    example: 'a1b2c3…',
    description: 'Hash Keccak-256 del padrón completo (64 hex)',
  })
  hashPadron: string;

  @ApiProperty({ enum: PadronEstado, example: PadronEstado.BORRADOR })
  estado: PadronEstado;

  @ApiProperty({ description: 'Fecha de generación del padrón' })
  fechaGeneracion: Date;
}

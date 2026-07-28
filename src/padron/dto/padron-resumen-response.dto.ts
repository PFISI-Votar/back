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
    description:
      'Raíz Merkle Keccak-256 del padrón (64 hex, sin prefijo 0x). Sello de integridad del comicio.',
  })
  hashPadron: string;

  @ApiProperty({ enum: PadronEstado, example: PadronEstado.BORRADOR })
  estado: PadronEstado;

  @ApiProperty({ description: 'Fecha de generación del padrón' })
  fechaGeneracion: Date;

  @ApiProperty({
    example: 105,
    description: 'Filas de datos leídas del CSV en la importación',
  })
  totalProcesados: number;

  @ApiProperty({
    example: 5,
    description: 'Filas omitidas (defectuosas o duplicadas) en la importación',
  })
  totalOmitidos: number;
}

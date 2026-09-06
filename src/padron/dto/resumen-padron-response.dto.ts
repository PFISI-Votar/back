import { ApiProperty } from '@nestjs/swagger';

/** Resumen agregado del padrón para reportes institucionales (ej. Acta de Apertura, VOTAR-374). */
export class ResumenPadronResponseDto {
  @ApiProperty({ example: 1500 })
  totalVotantesHabilitados: number;

  @ApiProperty({ example: 'a1b2c3…' })
  hashPadron: string;
}

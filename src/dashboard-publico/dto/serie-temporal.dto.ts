import { ApiProperty } from '@nestjs/swagger';

export class SerieTemporalPuntoDto {
  @ApiProperty({ example: '14:00' })
  etiqueta!: string;

  @ApiProperty({ example: 18 })
  acumulado!: number;

  @ApiProperty({ example: 3 })
  nuevos!: number;
}

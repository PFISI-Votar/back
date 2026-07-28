import { ApiProperty } from '@nestjs/swagger';

export class FormulaParticipacionDto {
  @ApiProperty({ example: 100 })
  totalPadron: number;

  @ApiProperty({ example: 25 })
  votosAfirmativos: number;

  @ApiProperty({ example: 0 })
  votosEnBlanco: number;

  @ApiProperty({ example: 0 })
  votosNulos: number;

  @ApiProperty({ example: 25 })
  totalSufragios: number;

  @ApiProperty({ example: 25 })
  porcentajeParticipacion: number;

  @ApiProperty({
    example: '(25 + 0 + 0) / 100 × 100 = 25%',
    description: 'Expresión matemática visible para transparencia del cálculo',
  })
  expresion: string;
}

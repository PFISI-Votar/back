import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ReanudarComicioDto {
  @ApiProperty({
    example: 'Incidente resuelto: se restableció la conectividad del nodo.',
    description:
      'Justificación de la reanudación, registrada en el Audit Log junto al hash de la transacción on-chain.',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(500)
  razon!: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class PausarComicioDto {
  @ApiProperty({
    example: 'Actividad sospechosa detectada en el nodo de votación',
    description:
      'Justificación de la pausa, registrada en el evento on-chain y en el audit log.',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(500)
  razon!: string;
}

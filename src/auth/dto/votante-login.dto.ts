import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min, MinLength } from 'class-validator';

export class VotanteLoginDto {
  @ApiProperty({
    example: '14988',
    description: 'Usuario institucional (nick o legajo) de Autogestión UTN',
  })
  @IsString()
  @IsNotEmpty()
  nick: string;

  @ApiProperty({
    example: '********',
    description: 'Contraseña de Autogestión UTN',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  password: string;

  @ApiProperty({
    example: 1,
    description: 'Identificador del comicio al que accede el votante',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idEleccion: number;
}

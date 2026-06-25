import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: '12345678',
    description: 'Usuario institucional (nick) de Autogestión UTN',
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
}

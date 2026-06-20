import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';
import sanitizeHtml from 'sanitize-html';

export class RolCandidatoDto {
  @ApiProperty({ example: 'Presidente' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Transform(({ value }) =>
    sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }),
  )
  nombre: string;

  @ApiProperty({
    example: 1,
    description:
      'Cantidad máxima de postulantes permitidos para el rol en la lista',
  })
  @IsInt()
  @Min(1)
  maximoPostulantes: number;
}

export class RolCandidatoResponseDto {
  @ApiProperty()
  idCategoria: number;

  @ApiProperty()
  nombre: string;

  @ApiProperty()
  maximoPostulantes: number;

  @ApiProperty()
  orden: number;
}

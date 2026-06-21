import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import sanitizeHtml from 'sanitize-html';

export class RolCandidatoDto {
  @ApiPropertyOptional({
    example: 1,
    description: 'Identificador del rol existente (solo en actualización)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  idCategoria?: number;

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

import { IsString, IsNotEmpty, IsDateString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import sanitizeHtml from 'sanitize-html';

export class CrearEleccionDto {
  @ApiProperty({ example: 'Elecciones UTN 2026', description: 'Nombre del comicio. Máximo 255 caracteres.', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Transform(({ value }) => sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }))
  nombre: string;

  @ApiProperty({ example: 'Elecciones de centro estudiantil', description: 'Descripción opcional.', required: false, maxLength: 500 })
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => value ? sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }) : value)
  descripcion?: string;

  @ApiProperty({ example: '2026-09-01T10:00:00Z', description: 'Fecha y hora de inicio en formato ISO 8601.' })
  @IsDateString()
  @IsNotEmpty()
  fechaInicio: string;

  @ApiProperty({ example: '2026-09-01T18:00:00Z', description: 'Fecha y hora de cierre en formato ISO 8601.' })
  @IsDateString()
  @IsNotEmpty()
  fechaFin: string;
}
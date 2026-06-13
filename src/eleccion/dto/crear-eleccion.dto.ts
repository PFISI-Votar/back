import { IsString, IsNotEmpty, IsDateString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import sanitizeHtml from 'sanitize-html';

export class CrearEleccionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Transform(({ value }) => sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }))
  nombre: string;

  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => value ? sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }) : value)
  descripcion?: string;

  @IsDateString()
  @IsNotEmpty()
  fechaInicio: string;

  @IsDateString()
  @IsNotEmpty()
  fechaFin: string;
}
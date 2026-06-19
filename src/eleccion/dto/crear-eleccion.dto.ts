import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import sanitizeHtml from 'sanitize-html';
import { IsUtcIso8601 } from '../../common/validators/is-utc-iso8601.decorator';

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

  @IsUtcIso8601()
  @IsNotEmpty()
  fechaInicio: string;

  @IsUtcIso8601()
  @IsNotEmpty()
  fechaFin: string;
}
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  sanitizeOptionalPlainText,
  sanitizePlainText,
} from '@/common/utils/sanitize-plain-text.util';

export class CrearCategoriaDto {
  @ApiProperty({
    example: 'Presidente',
    description: 'Nombre del cargo o categoría. Máximo 100 caracteres.',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty({ message: 'El nombre no puede estar vacío.' })
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres.' })
  @Transform(({ value }: { value: unknown }) => sanitizePlainText(value))
  nombre: string;

  @ApiPropertyOptional({
    example: 'Cargo de presidente del centro estudiantil',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, {
    message: 'La descripción no puede superar los 500 caracteres.',
  })
  @Transform(({ value }: { value: unknown }) =>
    sanitizeOptionalPlainText(value),
  )
  descripcion?: string;

  @ApiPropertyOptional({
    example: 0,
    description:
      'Mínimo de postulantes requeridos por lista para esta categoría.',
    default: 0,
  })
  @IsOptional()
  @IsInt({ message: 'El mínimo de postulantes debe ser un número entero.' })
  @Min(0, { message: 'El mínimo de postulantes no puede ser negativo.' })
  minimoPostulantes?: number;

  @ApiProperty({
    example: 1,
    description:
      'Máximo de postulantes permitidos por lista para esta categoría.',
  })
  @IsInt({ message: 'El máximo de postulantes debe ser un número entero.' })
  @Min(1, { message: 'El máximo de postulantes debe ser al menos 1.' })
  maximoPostulantes: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'Orden de visualización en la boleta.',
  })
  @IsOptional()
  @IsInt({ message: 'El orden debe ser un número entero.' })
  @Min(1, { message: 'El orden debe ser al menos 1.' })
  orden?: number;
}

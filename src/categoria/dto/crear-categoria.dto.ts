import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import sanitizeHtml from 'sanitize-html';

export class CrearCategoriaDto {
  @ApiProperty({
    example: 'Presidente',
    description: 'Nombre del cargo o categoría. Máximo 100 caracteres, sin caracteres especiales de escape.',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty({ message: 'El nombre no puede estar vacío.' })
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres.' })
  @Transform(({ value }) =>
    sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }),
  )
  nombre: string;

  @ApiProperty({
    example: 'Cargo de presidente del centro estudiantil',
    description: 'Descripción opcional del cargo.',
    required: false,
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'La descripción no puede superar los 500 caracteres.' })
  @Transform(({ value }) =>
    value ? sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }) : value,
  )
  descripcion?: string;

  @ApiProperty({
    example: 1,
    description: 'Cantidad de cargos a cubrir. Mínimo 1.',
    default: 1,
    required: false,
  })
  @IsOptional()
  @IsInt({ message: 'La cantidad de cargos debe ser un número entero.' })
  @Min(1, { message: 'La cantidad de cargos debe ser al menos 1.' })
  cantidadCargos?: number;

  @ApiProperty({
    example: 1,
    description: 'Orden de visualización en la boleta. Mínimo 1.',
    default: 1,
    required: false,
  })
  @IsOptional()
  @IsInt({ message: 'El orden debe ser un número entero.' })
  @Min(1, { message: 'El orden debe ser al menos 1.' })
  orden?: number;
}
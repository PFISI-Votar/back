import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import sanitizeHtml from 'sanitize-html';

export class CreateCandidatoDto {
  @ApiProperty({ example: 'Juan' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }))
  nombre: string;

  @ApiProperty({ example: 'Pérez' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }))
  apellido: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  idCategoria: number;

  @ApiPropertyOptional({ example: 'Presidente' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) =>
    value ? sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }) : value,
  )
  cargo?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  orden?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  fotoUrl?: string;

  @ApiProperty({
    example: { legajo_utn: '14988', dni: '40123456', cantidad_avales: 3 },
    description: 'Valores de campos adicionales según configuración del comicio',
  })
  @IsObject()
  datosAdicionales: Record<string, unknown>;
}

export class UpdateCandidatoDto {
  @ApiPropertyOptional({ example: 'Juan' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }))
  nombre?: string;

  @ApiPropertyOptional({ example: 'Pérez' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }))
  apellido?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  idCategoria?: number;

  @ApiPropertyOptional({ example: 'Presidente' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) =>
    value ? sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }) : value,
  )
  cargo?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  orden?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  fotoUrl?: string;

  @ApiPropertyOptional({
    example: { legajo_utn: '14988', dni: '40123456', cantidad_avales: 3 },
  })
  @IsOptional()
  @IsObject()
  datosAdicionales?: Record<string, unknown>;
}

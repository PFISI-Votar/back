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
import { sanitizePlainText } from '@/common/utils/sanitize-plain-text.util';

export class CreateCandidatoDto {
  @ApiProperty({ example: 'Juan' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => sanitizePlainText(value))
  nombre: string;

  @ApiProperty({ example: 'Pérez' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => sanitizePlainText(value))
  apellido: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  idCategoria: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  orden?: number;

  @ApiProperty({
    example: { legajo_utn: '14988', dni: '40123456', cantidad_avales: 3 },
    description:
      'Valores de campos adicionales según configuración del comicio',
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
  @Transform(({ value }: { value: unknown }) => sanitizePlainText(value))
  nombre?: string;

  @ApiPropertyOptional({ example: 'Pérez' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => sanitizePlainText(value))
  apellido?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  idCategoria?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  orden?: number;

  @ApiPropertyOptional({
    example: { legajo_utn: '14988', dni: '40123456', cantidad_avales: 3 },
  })
  @IsOptional()
  @IsObject()
  datosAdicionales?: Record<string, unknown>;
}

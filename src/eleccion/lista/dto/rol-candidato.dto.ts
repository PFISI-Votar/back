import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { sanitizePlainText } from '@/common/utils/sanitize-plain-text.util';

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
  @Transform(({ value }: { value: unknown }) => sanitizePlainText(value))
  nombre: string;

  @ApiPropertyOptional({
    example: 0,
    description:
      'Cantidad mínima de postulantes requeridos para el rol en cada lista (0 = sin requisito)',
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  minimoPostulantes?: number;

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

  @ApiProperty({
    description:
      'Cantidad mínima de postulantes requeridos para el rol en cada lista',
  })
  minimoPostulantes: number;

  @ApiProperty()
  orden: number;
}

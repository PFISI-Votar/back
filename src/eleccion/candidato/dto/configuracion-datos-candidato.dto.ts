import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform } from 'class-transformer';
import sanitizeHtml from 'sanitize-html';
import type {
  CampoCandidatoDefinicion,
  TipoCampoCandidato,
} from '@/eleccion/candidato/interfaces/campo-candidato-definicion.interface';

const TIPOS_CAMPO: TipoCampoCandidato[] = [
  'texto',
  'numero',
  'email',
  'url',
  'fecha',
  'booleano',
];

export class ValidacionCampoCandidatoDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  minLength?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxLength?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  min?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  max?: number;

  @ApiPropertyOptional({ example: '^\\d{4,6}$' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pattern?: string;

  @ApiPropertyOptional({ example: 'Formato inválido' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) =>
    value
      ? sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })
      : value,
  )
  patternMessage?: string;
}

export class CampoCandidatoDefinicionDto implements CampoCandidatoDefinicion {
  @ApiProperty({ example: 'legajo-utn' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[a-z][a-z0-9_-]*$/, {
    message:
      'La clave debe usar minúsculas, números y guiones (ej. legajo-utn)',
  })
  clave: string;

  @ApiProperty({ example: 'Legajo UTN' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) =>
    sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }),
  )
  etiqueta: string;

  @ApiProperty({ enum: TIPOS_CAMPO, example: 'texto' })
  @IsIn(TIPOS_CAMPO)
  tipo: TipoCampoCandidato;

  @ApiProperty({ example: true })
  @IsBoolean()
  obligatorio: boolean;

  @ApiPropertyOptional({ example: '14988' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) =>
    value
      ? sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })
      : value,
  )
  ejemplo?: string;

  @ApiPropertyOptional({ example: 'Legajo institucional de 4 a 6 dígitos' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) =>
    value
      ? sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })
      : value,
  )
  ayuda?: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  orden: number;

  @ApiPropertyOptional({ type: ValidacionCampoCandidatoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ValidacionCampoCandidatoDto)
  validacion?: ValidacionCampoCandidatoDto;
}

export class GuardarConfiguracionDatosCandidatoDto {
  @ApiProperty({ type: [CampoCandidatoDefinicionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CampoCandidatoDefinicionDto)
  campos: CampoCandidatoDefinicionDto[];
}

export class ConfiguracionDatosCandidatoResponseDto {
  @ApiProperty()
  idEleccion: number;

  @ApiProperty({ type: [CampoCandidatoDefinicionDto] })
  campos: CampoCandidatoDefinicion[];

  @ApiProperty()
  editable: boolean;

  @ApiProperty()
  cantidadCandidatos: number;
}

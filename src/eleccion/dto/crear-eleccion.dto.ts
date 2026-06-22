import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  sanitizeOptionalPlainText,
  sanitizePlainText,
} from '@/common/utils/sanitize-plain-text.util';
import { MetodoAutenticacion } from '@/eleccion/configuracion-comicio/enums/metodo-autenticacion.enum';
import { IsUtcIso8601 } from '@/common/validators/is-utc-iso8601.decorator';
import { TipoVotacion } from '@/eleccion/enums/tipo-votacion.enum';
import { RolCandidatoDto } from '@/eleccion/lista/dto/rol-candidato.dto';

export class CrearEleccionDto {
  @ApiProperty({ example: 'Elección CEUTI 2026' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) => sanitizePlainText(value))
  nombre: string;

  @ApiPropertyOptional({ example: 'Proceso electoral estudiantil' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }: { value: unknown }) =>
    sanitizeOptionalPlainText(value),
  )
  descripcion?: string;

  @ApiProperty({ example: '2026-09-01T10:00:00.000Z' })
  @IsUtcIso8601()
  @IsNotEmpty()
  fechaInicio: string;

  @ApiProperty({ example: '2026-09-02T22:00:00.000Z' })
  @IsUtcIso8601()
  @IsNotEmpty()
  fechaFin: string;

  @ApiProperty({ enum: TipoVotacion, example: TipoVotacion.POR_LISTA })
  @IsEnum(TipoVotacion)
  tipoVotacion: TipoVotacion;

  @ApiProperty({ type: [RolCandidatoDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RolCandidatoDto)
  roles: RolCandidatoDto[];

  @ApiProperty({
    enum: MetodoAutenticacion,
    isArray: true,
    example: [MetodoAutenticacion.SSO_INSTITUCIONAL],
  })
  @IsArray()
  @IsEnum(MetodoAutenticacion, { each: true })
  metodosAutenticacion: MetodoAutenticacion[];
}

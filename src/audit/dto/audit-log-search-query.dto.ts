import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { NivelEventoAudit } from '@/audit/enums/nivel-evento-audit.enum';
import { ResultadoEventoAudit } from '@/audit/enums/resultado-evento-audit.enum';
import { TipoEventoAudit } from '@/audit/enums/tipo-evento-audit.enum';
import { sanitizeOptionalPlainText } from '@/common/utils/sanitize-plain-text.util';

const toStringArray = (value: unknown): string[] | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === 'string' ? item : String(item),
    );
  }
  if (typeof value === 'string') {
    return [value];
  }
  return undefined;
};

/** Parámetros de búsqueda avanzada sobre audit_log (VOTAR-371). */
export class AuditLogSearchQueryDto {
  @ApiPropertyOptional({
    example: 1,
    default: 1,
    description: 'Página (1-based)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    example: 50,
    default: 50,
    description: 'Tamaño de página (máx. 200)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 50;

  @ApiPropertyOptional({ example: 3, description: 'Filtrar por comicio' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idEleccion?: number;

  @ApiPropertyOptional({
    enum: TipoEventoAudit,
    isArray: true,
    description: 'Tipos de evento (OR lógico)',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toStringArray(value))
  @IsArray()
  @IsEnum(TipoEventoAudit, { each: true })
  tipoEvento?: TipoEventoAudit[];

  @ApiPropertyOptional({
    example: 'a1b2c3…',
    description:
      'ID ofuscado del operador (hash SHA-256) o identificador crudo (se hashea server-side)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Transform(({ value }: { value: unknown }) =>
    sanitizeOptionalPlainText(value),
  )
  actor?: string;

  @ApiPropertyOptional({
    example: '192.168.1.1',
    description: 'IP/host crudo (se hashea) o hash de terminal (64 hex)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Transform(({ value }: { value: unknown }) =>
    sanitizeOptionalPlainText(value),
  )
  terminal?: string;

  @ApiPropertyOptional({
    example: '/padron/import',
    description: 'Filtro parcial sobre endpoint',
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  @Transform(({ value }: { value: unknown }) =>
    sanitizeOptionalPlainText(value),
  )
  endpoint?: string;

  @ApiPropertyOptional({
    example: '2026-07-21T12:00:00.000Z',
    description: 'Inicio del rango temporal (inclusive)',
  })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiPropertyOptional({
    example: '2026-07-21T14:00:00.000Z',
    description: 'Fin del rango temporal (inclusive)',
  })
  @IsOptional()
  @IsDateString()
  hasta?: string;

  @ApiPropertyOptional({
    enum: NivelEventoAudit,
    description: 'Nivel en datos_adicionales',
  })
  @IsOptional()
  @IsEnum(NivelEventoAudit)
  nivel?: NivelEventoAudit;

  @ApiPropertyOptional({
    enum: ResultadoEventoAudit,
    description: 'Resultado en datos_adicionales',
  })
  @IsOptional()
  @IsEnum(ResultadoEventoAudit)
  resultado?: ResultadoEventoAudit;

  @ApiPropertyOptional({
    example: 'padrón',
    description: 'Búsqueda libre en descripción (ILIKE)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }: { value: unknown }) =>
    sanitizeOptionalPlainText(value),
  )
  q?: string;
}

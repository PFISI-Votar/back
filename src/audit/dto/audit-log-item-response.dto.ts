import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoEventoAudit } from '@/audit/enums/tipo-evento-audit.enum';

/** Entrada individual del registro de auditoría institucional (sin PII). */
export class AuditLogItemResponseDto {
  @ApiProperty({ example: 42 })
  idLog: number;

  @ApiPropertyOptional({
    example: 3,
    nullable: true,
    description:
      'Comicio asociado; null para eventos globales (login, acceso denegado)',
  })
  idEleccion: number | null;

  @ApiProperty({ enum: TipoEventoAudit, example: TipoEventoAudit.LOGIN })
  tipoEvento: TipoEventoAudit;

  @ApiProperty({ example: '2026-07-22T15:30:00.000Z' })
  timestamp: Date;

  @ApiProperty({
    example: 'a1b2c3d4e5f6…',
    description: 'Identificador ofuscado del operador (hash SHA-256)',
  })
  actor: string;

  @ApiPropertyOptional({
    example: 'Usuario Administrador con ID Ofuscado … inició sesión…',
    nullable: true,
  })
  descripcion: string | null;

  @ApiProperty({ example: 'POST /auth/login' })
  endpoint: string;

  @ApiPropertyOptional({
    example: 'f6e5d4c3b2a1…',
    nullable: true,
    description:
      'Identificador criptográfico de terminal (hash); null en VOTO_EMITIDO',
  })
  identificadorTerminal: string | null;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  datosAdicionales: Record<string, unknown> | null;

  @ApiPropertyOptional({
    example: 'abc123…',
    nullable: true,
    description: 'Hash del bloque de auditoría (VOTAR-370)',
  })
  hashRegistro: string | null;

  @ApiPropertyOptional({
    example: '000000…',
    nullable: true,
    description: 'Hash del bloque anterior en la cadena',
  })
  hashAnterior: string | null;
}

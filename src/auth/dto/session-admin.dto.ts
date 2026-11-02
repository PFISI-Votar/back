import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * VOTAR-492 §12.2 — string de confirmación literal exigido para la revocación
 * global. Evita que un cliente mal escrito dispare la operación sin intención.
 */
export const CONFIRMACION_REVOCACION_GLOBAL = 'REVOCAR_TODAS_LAS_SESIONES';

export class SesionActivaDto {
  @ApiProperty({ example: 42 })
  idSession: number;

  @ApiProperty({ example: '14988' })
  identificadorSso: string;

  @ApiProperty({ example: '14988' })
  sub: string;

  @ApiProperty({ nullable: true, example: 'admin@frvm.utn.edu.ar' })
  email: string | null;

  @ApiProperty({ nullable: true, example: 'Bruno Lucarelli' })
  nombre: string | null;

  @ApiProperty({ example: '2026-09-08T12:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-09-08T12:25:00.000Z' })
  lastActivityAt: string;

  @ApiProperty({ example: '2026-09-08T20:00:00.000Z' })
  expiresAt: string;

  @ApiProperty({
    example: false,
    description: 'true si es la sesión desde la que se hace esta consulta.',
  })
  actual: boolean;
}

export class RevocarSesionesUsuarioDto {
  @ApiProperty({
    example: '14988',
    description: 'Identificador SSO institucional del usuario objetivo.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  identificadorSso: string;

  @ApiProperty({
    minLength: 10,
    maxLength: 280,
    example: 'Credenciales institucionales comprometidas — ticket SEC-2026-014',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(280)
  motivo: string;
}

export class RevocarTodasSesionesDto {
  @ApiProperty({
    enum: [CONFIRMACION_REVOCACION_GLOBAL],
    example: CONFIRMACION_REVOCACION_GLOBAL,
    description: 'Confirmación explícita: debe ser exactamente este valor.',
  })
  @IsIn([CONFIRMACION_REVOCACION_GLOBAL])
  confirmacion: string;

  @ApiProperty({
    minLength: 10,
    maxLength: 280,
    example: 'Compromiso del IdP institucional — contención total',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(280)
  motivo: string;

  @ApiPropertyOptional({
    default: true,
    description:
      'Si false, también cierra la sesión del operador. Por defecto la preserva para poder revertir.',
  })
  @IsOptional()
  @IsBoolean()
  preservarSesionActual?: boolean;
}

export class RevocacionResultadoDto {
  @ApiProperty({ example: 3 })
  sesionesRevocadas: number;

  @ApiProperty({ enum: ['PROPIA', 'USUARIO', 'GLOBAL'], example: 'GLOBAL' })
  alcance: 'PROPIA' | 'USUARIO' | 'GLOBAL';
}

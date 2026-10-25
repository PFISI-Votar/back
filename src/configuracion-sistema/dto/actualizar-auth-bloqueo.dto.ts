import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { AuthBloqueoAlcance } from '@/configuracion-sistema/entities/configuracion-sistema.entity';

const ALCANCES: AuthBloqueoAlcance[] = ['NINGUNO', 'ADMIN', 'TODOS'];

/**
 * VOTAR-492 §12.2 — activación/desactivación del bloqueo de flujos de
 * autenticación institucional. `motivo` es obligatorio (mín. 10 caracteres)
 * cuando `alcance !== 'NINGUNO'`; el service lo valida.
 */
export class ActualizarAuthBloqueoDto {
  @ApiProperty({ enum: ALCANCES, example: 'ADMIN' })
  @IsIn(ALCANCES)
  alcance!: AuthBloqueoAlcance;

  @ApiPropertyOptional({
    minLength: 10,
    maxLength: 280,
    example:
      'Actividad sospechosa: rechazo masivo de tokens OAuth institucionales',
  })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(280)
  motivo?: string;
}

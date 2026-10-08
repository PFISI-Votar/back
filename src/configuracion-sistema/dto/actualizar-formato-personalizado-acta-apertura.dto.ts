import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { ActaAperturaModo } from '@/configuracion-sistema/entities/configuracion-sistema.entity';

const MODOS: ActaAperturaModo[] = ['SIMPLE', 'PERSONALIZADO'];

/** PATCH parcial: solo se actualizan los campos presentes en el body. */
export class ActualizarFormatoPersonalizadoActaAperturaDto {
  @ApiPropertyOptional({ enum: MODOS })
  @IsOptional()
  @IsIn(MODOS)
  modo?: ActaAperturaModo;

  @ApiPropertyOptional({ maxLength: 20000 })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  plantillaTexto?: string;
}

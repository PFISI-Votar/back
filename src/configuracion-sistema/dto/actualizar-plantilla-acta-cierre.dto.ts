import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/** PATCH parcial: solo se actualizan los toggles presentes en el body. */
export class ActualizarPlantillaActaCierreDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  incluirDescripcion?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  incluirParticipacion?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  incluirResultadosPorLista?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  incluirVerificacionCriptografica?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  incluirLogo?: boolean;
}

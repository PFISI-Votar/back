import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/** PATCH parcial: solo se actualizan los toggles presentes en el body. */
export class ActualizarPlantillaActaAperturaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  incluirDescripcion?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  incluirDatosApertura?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  incluirResumenPadron?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  incluirOfertaElectoral?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  incluirVerificacionCriptografica?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  incluirLogo?: boolean;
}

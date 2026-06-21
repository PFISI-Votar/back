import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Parámetros de paginación para listar las hojas del padrón. */
export class PaginacionPadronQueryDto {
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
}

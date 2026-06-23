import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SeleccionVotoDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  idCategoria: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  idCandidato: number;
}

export class ConfirmarVotoDto {
  @ApiProperty({
    description: 'UUID generado por el cliente para reintentos idempotentes',
  })
  @IsUUID()
  idempotencyKey: string;

  @ApiProperty({ type: [SeleccionVotoDto] })
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => SeleccionVotoDto)
  selecciones: SeleccionVotoDto[];

  @ApiPropertyOptional({
    description: 'Marca explícita para confirmar voto en blanco global',
  })
  @IsOptional()
  @IsBoolean()
  votoEnBlanco?: boolean;
}

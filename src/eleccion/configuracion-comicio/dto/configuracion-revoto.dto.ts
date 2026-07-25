import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { PoliticaRevoto } from '@/eleccion/configuracion-comicio/enums/politica-revoto.enum';

export class GuardarConfiguracionRevotoDto {
  @ApiProperty({
    description:
      'Habilita re-voto con política LAST_VOTE_WINS (RevoteConfig.enabled off-chain)',
    example: false,
  })
  @IsBoolean()
  permitirVotoMultiple: boolean;

  @ApiPropertyOptional({
    description:
      'Máximo de sufragios por votante. Mínimo 2 con re-voto habilitado (voto inicial + modificación). VOTAR-324 ampliará el rango superior.',
    example: 2,
    minimum: 2,
    maximum: 2,
  })
  @IsOptional()
  @ValidateIf((dto: GuardarConfiguracionRevotoDto) => dto.permitirVotoMultiple)
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(2)
  maxVotosPorVotante?: number;
}

export class ConfiguracionRevotoResponseDto {
  @ApiProperty({ example: 1 })
  idEleccion: number;

  @ApiProperty({ example: false })
  permitirVotoMultiple: boolean;

  @ApiProperty({ example: 1 })
  maxVotosPorVotante: number;

  @ApiProperty({ enum: PoliticaRevoto, example: PoliticaRevoto.DISABLED })
  politicaRevoto: PoliticaRevoto;

  @ApiProperty({
    description: 'True cuando el comicio está en BORRADOR y admite cambios',
    example: true,
  })
  editable: boolean;
}

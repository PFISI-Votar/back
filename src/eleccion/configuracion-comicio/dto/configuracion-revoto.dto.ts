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
      'Máximo de sufragios por votante. Solo editable cuando re-voto está habilitado (VOTAR-324 ampliará el rango)',
    example: 1,
    minimum: 1,
    maximum: 1,
  })
  @IsOptional()
  @ValidateIf((dto: GuardarConfiguracionRevotoDto) => dto.permitirVotoMultiple)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1)
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

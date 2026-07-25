import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional } from 'class-validator';
import { MAX_SUFRAGIOS_POR_VOTANTE } from '@/eleccion/configuracion-comicio/constants/revoto.constants';
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
      'Máximo de sufragios por votante. Mínimo 2 con re-voto habilitado (voto inicial + modificación), máximo 10. El rango se valida en el service (HTTP 422), no acá, para no degradar a 400.',
    example: 2,
    minimum: 1,
    maximum: MAX_SUFRAGIOS_POR_VOTANTE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
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

import { ApiProperty } from '@nestjs/swagger';

export class ActaAperturaPlantillaDto {
  @ApiProperty()
  incluirDescripcion: boolean;

  @ApiProperty()
  incluirDatosApertura: boolean;

  @ApiProperty()
  incluirResumenPadron: boolean;

  @ApiProperty()
  incluirOfertaElectoral: boolean;

  @ApiProperty()
  incluirVerificacionCriptografica: boolean;

  @ApiProperty()
  incluirLogo: boolean;
}

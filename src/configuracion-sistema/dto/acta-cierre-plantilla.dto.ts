import { ApiProperty } from '@nestjs/swagger';

export class ActaCierrePlantillaDto {
  @ApiProperty()
  incluirDescripcion: boolean;

  @ApiProperty()
  incluirParticipacion: boolean;

  @ApiProperty()
  incluirResultadosPorLista: boolean;

  @ApiProperty()
  incluirVerificacionCriptografica: boolean;

  @ApiProperty()
  incluirLogo: boolean;
}

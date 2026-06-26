import { ApiProperty } from '@nestjs/swagger';
import { MetodoAutenticacion } from '@/eleccion/configuracion-comicio/enums/metodo-autenticacion.enum';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { TipoVotacion } from '@/eleccion/enums/tipo-votacion.enum';

export class BudConfigResponseDto {
  @ApiProperty()
  idEleccion: number;

  @ApiProperty()
  nombre: string;

  @ApiProperty({ enum: EleccionEstado })
  estado: EleccionEstado;

  @ApiProperty({ enum: TipoVotacion })
  tipoVotacion: TipoVotacion;

  @ApiProperty({ enum: MetodoAutenticacion, isArray: true })
  metodosAutenticacion: MetodoAutenticacion[];
}

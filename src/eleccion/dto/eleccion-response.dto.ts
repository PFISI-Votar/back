import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MetodoAutenticacion } from '@/eleccion/configuracion-comicio/enums/metodo-autenticacion.enum';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { TipoVotacion } from '@/eleccion/enums/tipo-votacion.enum';
import { RolCandidatoResponseDto } from '@/eleccion/lista/dto/rol-candidato.dto';

export class EleccionResponseDto {
  @ApiProperty()
  idEleccion: number;

  @ApiProperty()
  nombre: string;

  @ApiPropertyOptional()
  descripcion?: string | null;

  @ApiProperty()
  fechaInicio: Date;

  @ApiProperty()
  fechaFin: Date;

  @ApiProperty({ enum: EleccionEstado })
  estado: EleccionEstado;

  @ApiProperty({ enum: TipoVotacion })
  tipoVotacion: TipoVotacion;

  @ApiProperty({ type: [RolCandidatoResponseDto] })
  roles: RolCandidatoResponseDto[];

  @ApiProperty({ enum: MetodoAutenticacion, isArray: true })
  metodosAutenticacion: MetodoAutenticacion[];
}

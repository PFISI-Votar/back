import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CandidatoResponseDto } from '@/eleccion/candidato/dto/candidato-response.dto';
import { RolCandidatoResponseDto } from '@/eleccion/lista/dto/rol-candidato.dto';

export class ListaResponseDto {
  @ApiProperty()
  idLista: number;

  @ApiProperty()
  idBoleta: number;

  @ApiProperty()
  nombre: string;

  @ApiProperty()
  sigla: string;

  @ApiPropertyOptional()
  color: string | null;

  @ApiPropertyOptional()
  logoUrl: string | null;

  @ApiProperty()
  estado: string;

  @ApiPropertyOptional()
  listId: number | null;

  @ApiPropertyOptional()
  fechaOficializacion: Date | null;

  @ApiPropertyOptional({ type: [CandidatoResponseDto] })
  candidatos?: CandidatoResponseDto[];

  @ApiPropertyOptional({ description: 'Categoría por defecto de la boleta' })
  idCategoriaDefault?: number;

  @ApiPropertyOptional({
    type: [RolCandidatoResponseDto],
    description: 'Roles de candidato definidos en el comicio',
  })
  roles?: RolCandidatoResponseDto[];
}

export class ListaMapeoItemDto {
  @ApiProperty()
  idLista: number;

  @ApiProperty()
  listId: number;

  @ApiProperty()
  nombre: string;

  @ApiProperty()
  sigla: string;
}

export class OficializarResponseDto {
  @ApiProperty()
  idEleccion: number;

  @ApiProperty()
  estado: string;

  @ApiProperty({ type: [ListaMapeoItemDto] })
  mapeo: ListaMapeoItemDto[];

  @ApiProperty({
    description:
      'VOTAR-473: false si el stack on-chain no se desplegó (p. ej. wallet sin fondos). Permite reintentar el despliegue sin re-oficializar.',
  })
  onChainDesplegado: boolean;
}

export class StackOnChainStatusDto {
  @ApiProperty()
  idEleccion: number;

  @ApiProperty({
    description:
      'True si ElectionFactory tiene ballot + voteRegistry + auditView para el comicio.',
  })
  desplegado: boolean;
}

export class DespliegueOnChainResponseDto {
  @ApiProperty()
  idEleccion: number;

  @ApiProperty()
  alreadyDeployed: boolean;

  @ApiProperty()
  txHash: string;

  @ApiProperty()
  ballot: string;

  @ApiProperty()
  voteRegistry: string;

  @ApiProperty()
  auditView: string;
}

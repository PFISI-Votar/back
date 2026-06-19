import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CandidatoResponseDto } from '@/eleccion/candidato/dto/candidato-response.dto';

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
}

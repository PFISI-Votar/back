import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CandidatoResponseDto {
  @ApiProperty()
  idCandidato: number;

  @ApiProperty()
  idLista: number;

  @ApiProperty()
  idCategoria: number;

  @ApiProperty()
  nombre: string;

  @ApiProperty()
  apellido: string;

  @ApiPropertyOptional()
  cargo: string | null;

  @ApiProperty()
  orden: number;

  @ApiPropertyOptional()
  fotoUrl: string | null;

  @ApiProperty({
    example: { legajo_utn: '14988', dni: '40123456', cantidad_avales: 3 },
  })
  datosAdicionales: Record<string, unknown>;
}

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

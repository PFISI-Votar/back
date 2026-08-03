import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum CategoriaBoletaEstado {
  DISPONIBLE = 'DISPONIBLE',
  SIN_CANDIDATOS = 'SIN_CANDIDATOS',
}

export class CandidatoBoletaDigitalDto {
  @ApiProperty()
  idCandidato: number;

  @ApiProperty()
  idCategoria: number;

  @ApiProperty()
  idLista: number;

  @ApiProperty()
  listId: number;

  @ApiProperty()
  nombre: string;

  @ApiProperty()
  apellido: string;

  @ApiProperty()
  nombreCompleto: string;

  @ApiProperty()
  agrupacionPolitica: string;

  @ApiProperty()
  numeroLista: number;

  @ApiPropertyOptional({ nullable: true })
  colorLista: string | null;

  @ApiPropertyOptional({ nullable: true })
  logoListaUrl: string | null;

  @ApiPropertyOptional({ nullable: true })
  fotoUrl: string | null;
}

export class CategoriaBoletaDigitalDto {
  @ApiProperty()
  idCategoria: number;

  @ApiProperty()
  nombre: string;

  @ApiPropertyOptional({ nullable: true })
  descripcion: string | null;

  @ApiProperty()
  orden: number;

  @ApiProperty({ enum: CategoriaBoletaEstado })
  estado: CategoriaBoletaEstado;

  @ApiProperty({ type: [CandidatoBoletaDigitalDto] })
  candidatos: CandidatoBoletaDigitalDto[];
}

export class BoletaDigitalResponseDto {
  @ApiProperty()
  idEleccion: number;

  @ApiProperty()
  nombreEleccion: string;

  @ApiProperty()
  estadoEleccion: string;

  @ApiProperty()
  idBoleta: number;

  @ApiProperty()
  titulo: string;

  @ApiProperty()
  permitirVotoEnBlanco: boolean;

  @ApiProperty({ type: [CategoriaBoletaDigitalDto] })
  categorias: CategoriaBoletaDigitalDto[];

  @ApiPropertyOptional({
    description:
      'Address del BallotContract desplegado por ElectionFactory para este comicio (VOTAR-337). Solo presente en la boleta autenticada del votante — la vista pública no lo expone.',
  })
  ballotContractAddress?: string;
}

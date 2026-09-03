import { ApiProperty } from '@nestjs/swagger';
import {
  ContratosPublicosDto,
  MerkleRootPublicoDto,
} from '@/dashboard-publico/dto/contrato-estado-publica-response.dto';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import type { AperturaModo } from '@/eleccion/entities/eleccion.entity';
import { ActaAperturaPlantillaDto } from '@/configuracion-sistema/dto/acta-apertura-plantilla.dto';
import type { ActaAperturaModo } from '@/configuracion-sistema/entities/configuracion-sistema.entity';
import { ResumenPadronResponseDto } from '@/padron/dto/resumen-padron-response.dto';

export class ActaAperturaFormatoPersonalizadoDto {
  @ApiProperty({ example: 'SIMPLE' })
  modo: ActaAperturaModo;

  @ApiProperty({ nullable: true })
  plantillaTexto: string | null;
}

export class ActaAperturaDatosAperturaDto {
  @ApiProperty({ example: 'MANUAL' })
  modo: AperturaModo;

  @ApiProperty({ example: '2026-09-01T10:00:12.000Z' })
  realizadaEn: string;

  @ApiProperty({ example: 'Ana Gómez', nullable: true })
  actorNombre: string | null;

  @ApiProperty({ example: 'ELECTION_ADMIN', nullable: true })
  actorRol: string | null;
}

export class ActaAperturaCandidatoDto {
  @ApiProperty({ example: 12 })
  idCandidato: number;

  @ApiProperty({ example: 'Pérez, Juan' })
  nombreCompleto: string;

  @ApiProperty({ example: 'Lista Celeste', nullable: true })
  listaNombre: string | null;

  @ApiProperty({ example: 'LC', nullable: true })
  listaSigla: string | null;

  @ApiProperty({ example: 1 })
  orden: number;
}

export class ActaAperturaCategoriaDto {
  @ApiProperty({ example: 3 })
  idCategoria: number;

  @ApiProperty({ example: 'Presidente' })
  nombre: string;

  @ApiProperty({ type: [ActaAperturaCandidatoDto] })
  candidatos: ActaAperturaCandidatoDto[];
}

export class ActaAperturaResponseDto {
  @ApiProperty({ example: 7 })
  idEleccion: number;

  @ApiProperty({ example: 'Elecciones UTN 2026' })
  nombreEleccion: string;

  @ApiProperty({ example: 'Elecciones de centro estudiantil', nullable: true })
  descripcion: string | null;

  @ApiProperty({ enum: EleccionEstado, example: EleccionEstado.ABIERTA })
  estado: EleccionEstado;

  @ApiProperty({ example: '2026-09-01T10:00:00.000Z' })
  fechaInicio: string;

  @ApiProperty({ example: '2026-09-01T18:00:00.000Z' })
  fechaFin: string;

  @ApiProperty({ example: '2026-09-01T10:05:00.000Z' })
  generadoEn: string;

  @ApiProperty({ type: ActaAperturaDatosAperturaDto, nullable: true })
  datosApertura: ActaAperturaDatosAperturaDto | null;

  @ApiProperty({ type: ResumenPadronResponseDto })
  padron: ResumenPadronResponseDto;

  @ApiProperty({
    example: '/imagenes/3f8c1c2a-5b1e-4a9d-9f0c-2b7e5d6a1c34',
    nullable: true,
  })
  logoUrl: string | null;

  @ApiProperty({ type: [ActaAperturaCategoriaDto] })
  categorias: ActaAperturaCategoriaDto[];

  @ApiProperty({ type: MerkleRootPublicoDto })
  merkleRoot: MerkleRootPublicoDto;

  @ApiProperty({ example: 'Sepolia' })
  red: string;

  @ApiProperty({ example: 11155111 })
  chainId: number;

  @ApiProperty({ type: ContratosPublicosDto })
  contratos: ContratosPublicosDto;

  @ApiProperty({ type: ActaAperturaPlantillaDto })
  plantilla: ActaAperturaPlantillaDto;

  @ApiProperty({ type: ActaAperturaFormatoPersonalizadoDto })
  formatoPersonalizado: ActaAperturaFormatoPersonalizadoDto;
}

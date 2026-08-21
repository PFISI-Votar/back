import { ApiProperty } from '@nestjs/swagger';
import {
  ContratosPublicosDto,
  MerkleRootPublicoDto,
} from '@/dashboard-publico/dto/contrato-estado-publica-response.dto';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { TipoVotacion } from '@/eleccion/enums/tipo-votacion.enum';
import { ActaCierrePlantillaDto } from '@/configuracion-sistema/dto/acta-cierre-plantilla.dto';
import type { ActaAperturaModo } from '@/configuracion-sistema/entities/configuracion-sistema.entity';
import { CandidatoEscrutinioDto } from '@/escrutinio/dto/candidato-escrutinio.dto';
import { ParticipacionEscrutinioDto } from '@/escrutinio/dto/participacion-escrutinio.dto';

export class ActaCierreFormatoPersonalizadoDto {
  @ApiProperty({ example: 'SIMPLE' })
  modo: ActaAperturaModo;

  @ApiProperty({ nullable: true })
  plantillaTexto: string | null;
}

export class ActaCierreResponseDto {
  @ApiProperty({ example: 7 })
  idEleccion: number;

  @ApiProperty({ example: 'Elecciones UTN 2026' })
  nombreEleccion: string;

  @ApiProperty({ example: 'Elecciones de centro estudiantil', nullable: true })
  descripcion: string | null;

  @ApiProperty({ enum: EleccionEstado, example: EleccionEstado.CERRADA })
  estado: EleccionEstado;

  @ApiProperty({ enum: TipoVotacion })
  tipoVotacion: TipoVotacion;

  @ApiProperty({ example: '2026-09-01T10:00:00.000Z' })
  fechaInicio: string;

  @ApiProperty({ example: '2026-09-01T18:00:00.000Z' })
  fechaFin: string;

  @ApiProperty({ example: '2026-09-01T18:05:00.000Z' })
  generadoEn: string;

  @ApiProperty({ type: ParticipacionEscrutinioDto })
  participacion: ParticipacionEscrutinioDto;

  @ApiProperty({ type: [CandidatoEscrutinioDto] })
  candidatos: CandidatoEscrutinioDto[];

  @ApiProperty({
    example: '/uploads/sistema/logo-institucional-....jpg',
    nullable: true,
  })
  logoUrl: string | null;

  @ApiProperty({ type: MerkleRootPublicoDto })
  merkleRoot: MerkleRootPublicoDto;

  @ApiProperty({ example: 'Sepolia' })
  red: string;

  @ApiProperty({ example: 11155111 })
  chainId: number;

  @ApiProperty({ type: ContratosPublicosDto })
  contratos: ContratosPublicosDto;

  @ApiProperty({ type: ActaCierrePlantillaDto })
  plantilla: ActaCierrePlantillaDto;

  @ApiProperty({ type: ActaCierreFormatoPersonalizadoDto })
  formatoPersonalizado: ActaCierreFormatoPersonalizadoDto;
}

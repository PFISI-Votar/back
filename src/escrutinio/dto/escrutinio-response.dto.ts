import { ApiProperty } from '@nestjs/swagger';
import { CandidatoEscrutinioDto } from './candidato-escrutinio.dto';
import { ParticipacionEscrutinioDto } from './participacion-escrutinio.dto';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';

export class EscrutinioResponseDto {
  @ApiProperty({ example: 1 })
  idEleccion: number;

  @ApiProperty({ example: 'Elección CEUTI 2026' })
  nombre: string;

  @ApiProperty({ enum: EleccionEstado })
  estado: EleccionEstado;

  @ApiProperty({
    example: false,
    description:
      'True cuando el comicio está cerrado o mostrarResultadosTiempoReal=false',
  })
  congelado: boolean;

  @ApiProperty({
    example: 'ON_CHAIN',
    description: 'Fuente canónica de los tallies',
  })
  fuente: 'ON_CHAIN';

  @ApiProperty({
    example: '2026-07-20T19:00:00.000Z',
    description: 'Timestamp ISO del snapshot servido',
  })
  actualizadoEn: string;

  @ApiProperty({ type: ParticipacionEscrutinioDto })
  participacion: ParticipacionEscrutinioDto;

  @ApiProperty({ type: [CandidatoEscrutinioDto] })
  candidatos: CandidatoEscrutinioDto[];
}

import { EleccionEstado } from '../enums/eleccion-estado.enum';

export class CerrarEleccionResponseDto {
  idEleccion: number;
  estado: EleccionEstado;
  fechaCierre: Date;
  modo: 'MANUAL' | 'AUTOMATICO';
  snapshotCongelado: boolean;
}

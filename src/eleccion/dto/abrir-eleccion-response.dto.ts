import { EleccionEstado } from '../enums/eleccion-estado.enum';

export class AbrirEleccionResponseDto {
  idEleccion: number;
  estado: EleccionEstado;
  fechaApertura: Date;
  modo: 'MANUAL' | 'AUTOMATICO';
}

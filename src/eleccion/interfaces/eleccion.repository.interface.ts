import { CrearEleccionDto } from '@/eleccion/dto/crear-eleccion.dto';
import type { CrearEleccionCompletaResult } from '@/eleccion/repositories/eleccion.repository';

export const ELECCION_REPOSITORY = 'ELECCION_REPOSITORY';

export interface IEleccionRepository {
  crearCompleta(dto: CrearEleccionDto): Promise<CrearEleccionCompletaResult>;
}

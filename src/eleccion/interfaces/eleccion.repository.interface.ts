import { Eleccion } from '../entities/eleccion.entity';
import { CrearEleccionDto } from '../dto/crear-eleccion.dto';

export const ELECCION_REPOSITORY = 'ELECCION_REPOSITORY';

export interface IEleccionRepository {
  crear(dto: CrearEleccionDto): Promise<Eleccion>;
}
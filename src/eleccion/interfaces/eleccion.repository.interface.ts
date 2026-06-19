import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { CrearEleccionDto } from '@/eleccion/dto/crear-eleccion.dto';

export const ELECCION_REPOSITORY = 'ELECCION_REPOSITORY';

export interface IEleccionRepository {
  crear(dto: CrearEleccionDto): Promise<Eleccion>;
}

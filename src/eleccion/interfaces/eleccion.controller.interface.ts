import type { Eleccion } from '../entities/eleccion.entity';
import { CrearEleccionDto } from '../dto/crear-eleccion.dto';

export interface IEleccionController {
  crearEleccion(dto: CrearEleccionDto): Promise<Eleccion>;
}
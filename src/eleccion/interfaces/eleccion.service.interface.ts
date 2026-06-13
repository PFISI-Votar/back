import { Eleccion } from '../entities/eleccion.entity';
import { CrearEleccionDto } from '../dto/crear-eleccion.dto';

export interface IEleccionService {
  crearEleccion(dto: CrearEleccionDto): Promise<Eleccion>;
}
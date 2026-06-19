import type { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { CrearEleccionDto } from '@/eleccion/dto/crear-eleccion.dto';

export interface IEleccionController {
  crearEleccion(dto: CrearEleccionDto): Promise<Eleccion>;
}

import { Eleccion } from '../entities/eleccion.entity';
import { CrearEleccionDto } from '../dto/crear-eleccion.dto';

export interface IEleccionService {
  crearEleccion(dto: CrearEleccionDto): Promise<Eleccion>;
  listarElecciones(): Promise<Eleccion[]>;
  obtenerPorId(idEleccion: number): Promise<Eleccion>;
}
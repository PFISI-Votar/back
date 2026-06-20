import { CrearEleccionDto } from '@/eleccion/dto/crear-eleccion.dto';
import { EleccionResponseDto } from '@/eleccion/dto/eleccion-response.dto';

export interface IEleccionService {
  crearEleccion(dto: CrearEleccionDto): Promise<EleccionResponseDto>;
  listarElecciones(): Promise<EleccionResponseDto[]>;
  obtenerPorId(idEleccion: number): Promise<EleccionResponseDto>;
}

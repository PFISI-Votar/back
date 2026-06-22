import { ActualizarEleccionDto } from '@/eleccion/dto/actualizar-eleccion.dto';
import { CrearEleccionDto } from '@/eleccion/dto/crear-eleccion.dto';
import { EleccionResponseDto } from '@/eleccion/dto/eleccion-response.dto';

export interface IEleccionService {
  crearEleccion(dto: CrearEleccionDto): Promise<EleccionResponseDto>;
  actualizarEleccion(
    idEleccion: number,
    dto: ActualizarEleccionDto,
  ): Promise<EleccionResponseDto>;
  eliminarEleccion(idEleccion: number): Promise<void>;
  listarElecciones(): Promise<EleccionResponseDto[]>;
  obtenerPorId(idEleccion: number): Promise<EleccionResponseDto>;
}

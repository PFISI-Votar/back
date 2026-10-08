import { ActualizarEleccionDto } from '@/eleccion/dto/actualizar-eleccion.dto';
import { CrearEleccionDto } from '@/eleccion/dto/crear-eleccion.dto';
import { EleccionResponseDto } from '@/eleccion/dto/eleccion-response.dto';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';

export interface IEleccionService {
  crearEleccion(dto: CrearEleccionDto): Promise<EleccionResponseDto>;
  actualizarEleccion(
    idEleccion: number,
    dto: ActualizarEleccionDto,
  ): Promise<EleccionResponseDto>;
  eliminarEleccion(idEleccion: number): Promise<void>;
  listarElecciones(estado?: EleccionEstado): Promise<EleccionResponseDto[]>;
  obtenerPorId(idEleccion: number): Promise<EleccionResponseDto>;
}

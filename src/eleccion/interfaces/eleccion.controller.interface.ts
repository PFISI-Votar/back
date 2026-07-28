import { CrearEleccionDto } from '@/eleccion/dto/crear-eleccion.dto';
import { EleccionResponseDto } from '@/eleccion/dto/eleccion-response.dto';

export interface IEleccionController {
  crearEleccion(dto: CrearEleccionDto): Promise<EleccionResponseDto>;
}

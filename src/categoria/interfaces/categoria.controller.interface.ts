import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { ActualizarCategoriaDto } from '../dto/actualizar-categoria.dto';
import { CrearCategoriaDto } from '../dto/crear-categoria.dto';

export interface ICategoriaController {
  crearCategoria(idEleccion: number, dto: CrearCategoriaDto): Promise<Categoria>;
  listarCategorias(idEleccion: number): Promise<Categoria[]>;
  actualizarCategoria(
    idEleccion: number,
    idCategoria: number,
    dto: ActualizarCategoriaDto,
  ): Promise<Categoria>;
  eliminarCategoria(idEleccion: number, idCategoria: number): Promise<void>;
}

import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { ActualizarCategoriaDto } from '../dto/actualizar-categoria.dto';
import { CrearCategoriaDto } from '../dto/crear-categoria.dto';

export interface ICategoriaService {
  crearCategoria(
    idEleccion: number,
    dto: CrearCategoriaDto,
  ): Promise<Categoria>;
  actualizarCategoria(
    idEleccion: number,
    idCategoria: number,
    dto: ActualizarCategoriaDto,
  ): Promise<Categoria>;
  eliminarCategoria(idEleccion: number, idCategoria: number): Promise<void>;
  listarCategorias(idEleccion: number): Promise<Categoria[]>;
  validarCategoriasParaOficializar(idEleccion: number): Promise<void>;
}

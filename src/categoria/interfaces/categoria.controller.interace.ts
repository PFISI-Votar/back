import { Categoria } from '../entities/categoria.entity';
import { CrearCategoriaDto } from '../dto/crear-categoria.dto';

export interface ICategoriaController {
  crearCategoria(idEleccion: number, dto: CrearCategoriaDto): Promise<Categoria>;
  listarCategorias(idEleccion: number): Promise<Categoria[]>;
}
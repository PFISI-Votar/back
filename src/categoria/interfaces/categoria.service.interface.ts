import { Categoria } from '../entities/categoria.entity';
import { CrearCategoriaDto } from '../dto/crear-categoria.dto';

export interface ICategoriaService {
  crearCategoria(idEleccion: number, dto: CrearCategoriaDto): Promise<Categoria>;
  listarCategorias(idEleccion: number): Promise<Categoria[]>;
}
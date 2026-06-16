import { Categoria } from '../entities/categoria.entity';
import { CrearCategoriaDto } from '../dto/crear-categoria.dto';

export const CATEGORIA_REPOSITORY = 'CATEGORIA_REPOSITORY';

export interface ICategoriaRepository {
  crear(idEleccion: number, dto: CrearCategoriaDto): Promise<Categoria>;
  findByEleccion(idEleccion: number): Promise<Categoria[]>;
  findById(idCategoria: number): Promise<Categoria | null>;
  tieneCeroListasOficializadas(idEleccion: number): Promise<boolean>;
}
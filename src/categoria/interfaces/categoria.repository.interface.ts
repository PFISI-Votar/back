import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { ActualizarCategoriaDto } from '../dto/actualizar-categoria.dto';
import { CrearCategoriaDto } from '../dto/crear-categoria.dto';

export const CATEGORIA_REPOSITORY = 'CATEGORIA_REPOSITORY';

export interface ICategoriaRepository {
  crear(idEleccion: number, dto: CrearCategoriaDto): Promise<Categoria>;
  actualizar(
    idEleccion: number,
    idCategoria: number,
    dto: ActualizarCategoriaDto,
  ): Promise<Categoria>;
  eliminar(idEleccion: number, idCategoria: number): Promise<void>;
  findByEleccion(idEleccion: number): Promise<Categoria[]>;
  findById(idCategoria: number): Promise<Categoria | null>;
  findByIdAndEleccion(
    idEleccion: number,
    idCategoria: number,
  ): Promise<Categoria | null>;
  tieneCeroListasOficializadas(idEleccion: number): Promise<boolean>;
  obtenerMaximoUsoEnLista(idCategoria: number): Promise<number>;
  contarCandidatos(idCategoria: number): Promise<number>;
}

import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Eleccion } from '../eleccion/entities/eleccion.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { ActualizarCategoriaDto } from './dto/actualizar-categoria.dto';
import { CrearCategoriaDto } from './dto/crear-categoria.dto';
import { ICategoriaService } from './interfaces/categoria.service.interface';
import { CATEGORIA_REPOSITORY } from './interfaces/categoria.repository.interface';
import type { ICategoriaRepository } from './interfaces/categoria.repository.interface';
import { EleccionEstado } from '../eleccion/enums/eleccion-estado.enum';

@Injectable()
export class CategoriasService implements ICategoriaService {
  constructor(
    @Inject(CATEGORIA_REPOSITORY)
    private readonly categoriaRepository: ICategoriaRepository,
    @InjectRepository(Eleccion)
    private readonly eleccionOrmRepository: Repository<Eleccion>,
  ) {}

  async crearCategoria(
    idEleccion: number,
    dto: CrearCategoriaDto,
  ): Promise<Categoria> {
    const eleccion = await this.obtenerEleccionEditable(idEleccion);
    this.assertNombreValido(dto.nombre);
    this.assertMinimoMaximoValidos(
      dto.minimoPostulantes ?? 0,
      dto.maximoPostulantes,
    );
    return this.categoriaRepository.crear(eleccion.idEleccion, dto);
  }

  async actualizarCategoria(
    idEleccion: number,
    idCategoria: number,
    dto: ActualizarCategoriaDto,
  ): Promise<Categoria> {
    await this.obtenerEleccionEditable(idEleccion);
    const categoria = await this.categoriaRepository.findByIdAndEleccion(
      idEleccion,
      idCategoria,
    );
    if (!categoria) {
      throw new NotFoundException(
        `No se encontró la categoría ${idCategoria} en la elección ${idEleccion}.`,
      );
    }
    if (dto.nombre !== undefined) {
      this.assertNombreValido(dto.nombre);
    }
    const minimo = dto.minimoPostulantes ?? categoria.minimoPostulantes;
    const maximo = dto.maximoPostulantes ?? categoria.cantidadCargos;
    this.assertMinimoMaximoValidos(minimo, maximo);
    if (dto.maximoPostulantes !== undefined) {
      const maxUsage =
        await this.categoriaRepository.obtenerMaximoUsoEnLista(idCategoria);
      if (dto.maximoPostulantes < maxUsage) {
        throw new UnprocessableEntityException(
          `El máximo de postulantes para "${categoria.nombre}" no puede ser menor a ${maxUsage} (candidatos ya registrados en alguna lista).`,
        );
      }
    }
    return this.categoriaRepository.actualizar(idEleccion, idCategoria, dto);
  }

  async eliminarCategoria(
    idEleccion: number,
    idCategoria: number,
  ): Promise<void> {
    await this.obtenerEleccionEditable(idEleccion);
    const categoria = await this.categoriaRepository.findByIdAndEleccion(
      idEleccion,
      idCategoria,
    );
    if (!categoria) {
      throw new NotFoundException(
        `No se encontró la categoría ${idCategoria} en la elección ${idEleccion}.`,
      );
    }
    const totalCandidatos =
      await this.categoriaRepository.contarCandidatos(idCategoria);
    if (totalCandidatos > 0) {
      throw new UnprocessableEntityException(
        `No se puede eliminar la categoría "${categoria.nombre}" porque tiene candidatos registrados.`,
      );
    }
    await this.categoriaRepository.eliminar(idEleccion, idCategoria);
  }

  async listarCategorias(idEleccion: number): Promise<Categoria[]> {
    const eleccion = await this.eleccionOrmRepository.findOne({
      where: { idEleccion },
    });
    if (!eleccion) {
      throw new NotFoundException(
        `No se encontró la elección con id ${idEleccion}.`,
      );
    }
    return this.categoriaRepository.findByEleccion(idEleccion);
  }

  async validarCategoriasParaOficializar(idEleccion: number): Promise<void> {
    const categorias =
      await this.categoriaRepository.findByEleccion(idEleccion);
    if (categorias.length === 0) {
      throw new UnprocessableEntityException(
        'El comicio debe tener al menos una categoría antes de ser oficializado.',
      );
    }
    const hayDesiertas =
      await this.categoriaRepository.tieneCeroListasOficializadas(idEleccion);
    if (hayDesiertas) {
      throw new UnprocessableEntityException(
        'El comicio no puede oficializarse: existe al menos una categoría sin candidatos en ninguna lista.',
      );
    }
  }

  private async obtenerEleccionEditable(idEleccion: number): Promise<Eleccion> {
    const eleccion = await this.eleccionOrmRepository.findOne({
      where: { idEleccion },
    });
    if (!eleccion) {
      throw new NotFoundException(
        `No se encontró la elección con id ${idEleccion}.`,
      );
    }
    if (eleccion.estado !== EleccionEstado.BORRADOR) {
      throw new UnprocessableEntityException(
        'No se pueden modificar categorías de un comicio que ya fue oficializado.',
      );
    }
    return eleccion;
  }

  private assertNombreValido(nombre: string): void {
    if (!nombre || nombre.trim().length === 0) {
      throw new BadRequestException(
        'El nombre de la categoría no puede estar vacío.',
      );
    }
  }

  private assertMinimoMaximoValidos(minimo: number, maximo: number): void {
    if (minimo > maximo) {
      throw new BadRequestException(
        'El mínimo de postulantes no puede ser mayor al máximo.',
      );
    }
  }
}

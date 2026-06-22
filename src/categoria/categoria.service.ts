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
        'No se pueden agregar categorías a un comicio que ya fue oficializado.',
      );
    }

    if (!dto.nombre || dto.nombre.trim().length === 0) {
      throw new BadRequestException(
        'El nombre de la categoría no puede estar vacío.',
      );
    }

    return this.categoriaRepository.crear(idEleccion, dto);
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
        'El comicio no puede oficializarse: existe al menos una categoría sin listas oficializadas.',
      );
    }
  }
}
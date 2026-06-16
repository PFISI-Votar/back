import {
  Inject,
  Injectable,
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Categoria } from './entities/categoria.entity';
import { CrearCategoriaDto } from './dto/crear-categoria.dto';
import { ICategoriaService } from './interfaces/categoria.service.interface';
import { CATEGORIA_REPOSITORY } from './interfaces/categoria.repository.interface';
import type { ICategoriaRepository } from './interfaces/categoria.repository.interface';
import { ELECCION_REPOSITORY } from '../eleccion/interfaces/eleccion.repository.interface';
import type { IEleccionRepository } from '../eleccion/interfaces/eleccion.repository.interface';
import { EleccionEstado } from '../eleccion/enums/eleccion-estado.enum';

@Injectable()
export class CategoriasService implements ICategoriaService {
  constructor(
    @Inject(CATEGORIA_REPOSITORY)
    private readonly categoriaRepository: ICategoriaRepository,
    @Inject(ELECCION_REPOSITORY)
    private readonly eleccionRepository: IEleccionRepository,
  ) {}

  /**
   * CA-1: Crea una categoría en un comicio BORRADOR.
   * CA-2: Rechaza si nombre vacío, >100 chars o con caracteres de escape (validado por DTO + sanitize-html).
   * CA-4: Bloquea modificaciones si el comicio ya está CONFIGURADA (oficializado).
   */
  async crearCategoria(
    idEleccion: number,
    dto: CrearCategoriaDto,
  ): Promise<Categoria> {
    const eleccion = await this.eleccionRepository.findById(idEleccion);

    if (!eleccion) {
      throw new NotFoundException(
        `No se encontró la elección con id ${idEleccion}.`,
      );
    }

    // CA-4: Bloqueo post-oficialización
    if (eleccion.estado !== EleccionEstado.BORRADOR) {
      throw new UnprocessableEntityException(
        'No se pueden agregar categorías a un comicio que ya fue oficializado.',
      );
    }

    // CA-2: nombre vacío o >100 chars → ya lo cubre el DTO (@IsNotEmpty, @MaxLength, sanitizeHtml)
    // Validación extra post-sanitización: si quedó vacío tras sanear, lo rechazamos
    if (!dto.nombre || dto.nombre.trim().length === 0) {
      throw new BadRequestException(
        'El nombre de la categoría no puede estar vacío.',
      );
    }

    return this.categoriaRepository.crear(idEleccion, dto);
  }

  //Lista todas las categorías de una elección, ordenadas por `orden` ASC.
  async listarCategorias(idEleccion: number): Promise<Categoria[]> {
    const eleccion = await this.eleccionRepository.findById(idEleccion);

    if (!eleccion) {
      throw new NotFoundException(
        `No se encontró la elección con id ${idEleccion}.`,
      );
    }

    return this.categoriaRepository.findByEleccion(idEleccion);
  }

  /**
   * CA-3: Verifica si el comicio tiene alguna categoría sin listas oficializadas.
   * Llamado desde EleccionesService al momento de oficializar (HU futura).
   */
  async validarCategoriasParaOficializar(idEleccion: number): Promise<void> {
    const categorias = await this.categoriaRepository.findByEleccion(idEleccion);

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
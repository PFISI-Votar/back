import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { ActualizarEleccionDto } from '@/eleccion/dto/actualizar-eleccion.dto';
import { CrearEleccionDto } from '@/eleccion/dto/crear-eleccion.dto';
import { EleccionResponseDto } from '@/eleccion/dto/eleccion-response.dto';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { CrearEleccionValidationException } from '@/eleccion/exceptions/crear-eleccion-validation.exception';
import { IEleccionService } from '@/eleccion/interfaces/eleccion.service.interface';
import { ELECCION_REPOSITORY } from '@/eleccion/interfaces/eleccion.repository.interface';
import type { IEleccionRepository } from '@/eleccion/interfaces/eleccion.repository.interface';
import { mapEleccionToResponseDto } from '@/eleccion/mappers/eleccion.mapper';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { ConfiguracionComicioService } from '@/eleccion/configuracion-comicio/services/configuracion-comicio.service';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { parseUtcDateTime } from '@/common/utils/parse-utc-datetime.util';
import { assertEleccionEditable } from '@/eleccion/utils/eleccion-editable.util';

/**
 * Orquesta la creación de comicios en estado BORRADOR.
 * Invariante: prohibido compilar, desplegar o ejecutar escrituras blockchain en este flujo.
 */
@Injectable()
export class EleccionesService implements IEleccionService {
  constructor(
    @Inject(ELECCION_REPOSITORY)
    private readonly eleccionRepository: IEleccionRepository,
    @InjectRepository(Eleccion)
    private readonly eleccionOrmRepository: Repository<Eleccion>,
    @InjectRepository(ConfiguracionComicio)
    private readonly configuracionComicioOrmRepository: Repository<ConfiguracionComicio>,
    @InjectRepository(Boleta)
    private readonly boletaOrmRepository: Repository<Boleta>,
    @InjectRepository(Categoria)
    private readonly categoriaOrmRepository: Repository<Categoria>,
    private readonly configuracionComicioService: ConfiguracionComicioService,
  ) {}

  async crearEleccion(dto: CrearEleccionDto): Promise<EleccionResponseDto> {
    this.validarFechas(dto);
    this.configuracionComicioService.assertMetodosAutenticacionValidos(
      dto.metodosAutenticacion,
    );

    const result = await this.eleccionRepository.crearCompleta(dto);
    return mapEleccionToResponseDto(
      result.eleccion,
      result.categorias,
      result.metodosAutenticacion,
    );
  }

  async actualizarEleccion(
    idEleccion: number,
    dto: ActualizarEleccionDto,
  ): Promise<EleccionResponseDto> {
    this.validarFechas(dto);
    this.configuracionComicioService.assertMetodosAutenticacionValidos(
      dto.metodosAutenticacion,
    );

    const result = await this.eleccionRepository.actualizarCompleta(
      idEleccion,
      dto,
    );
    return mapEleccionToResponseDto(
      result.eleccion,
      result.categorias,
      result.metodosAutenticacion,
    );
  }

  async eliminarEleccion(idEleccion: number): Promise<void> {
    const eleccion = await this.eleccionOrmRepository.findOne({
      where: { idEleccion },
    });
    if (!eleccion) {
      throw new NotFoundException(`Elección ${idEleccion} no encontrada`);
    }
    assertEleccionEditable(eleccion);
    await this.eleccionOrmRepository.remove(eleccion);
  }

  /**
   * VOTAR-322: sin filtro devuelve el panel de gestión activa (excluye
   * comicios ARCHIVADA); con `estado` filtra exactamente a ese estado
   * (usado por la pestaña Históricos con `estado=ARCHIVADA`).
   */
  async listarElecciones(
    estado?: EleccionEstado,
  ): Promise<EleccionResponseDto[]> {
    const where = estado
      ? { estado }
      : { estado: Not(EleccionEstado.ARCHIVADA) };
    const elecciones = await this.eleccionOrmRepository.find({
      where,
      order: { idEleccion: 'DESC' },
    });
    return Promise.all(
      elecciones.map((eleccion) => this.mapEleccionWithRelations(eleccion)),
    );
  }

  async obtenerPorId(idEleccion: number): Promise<EleccionResponseDto> {
    const eleccion = await this.eleccionOrmRepository.findOne({
      where: { idEleccion },
    });
    if (!eleccion) {
      throw new NotFoundException(`Elección ${idEleccion} no encontrada`);
    }
    return this.mapEleccionWithRelations(eleccion);
  }

  private validarFechas(dto: CrearEleccionDto): void {
    const ahora = new Date();
    const fechaInicio = parseUtcDateTime(dto.fechaInicio);
    const fechaFin = parseUtcDateTime(dto.fechaFin);

    if (fechaInicio <= ahora) {
      throw new CrearEleccionValidationException([
        {
          field: 'fechaInicio',
          message: 'La fecha de inicio debe ser posterior al momento actual.',
        },
      ]);
    }

    if (fechaFin <= ahora) {
      throw new CrearEleccionValidationException([
        {
          field: 'fechaFin',
          message: 'La fecha de cierre debe ser posterior al momento actual.',
        },
      ]);
    }

    if (fechaFin <= fechaInicio) {
      throw new CrearEleccionValidationException([
        {
          field: 'fechaFin',
          message:
            'La fecha de cierre debe ser posterior a la fecha de inicio.',
        },
      ]);
    }
  }

  private async mapEleccionWithRelations(
    eleccion: Eleccion,
  ): Promise<EleccionResponseDto> {
    const config = await this.configuracionComicioOrmRepository.findOne({
      where: { idEleccion: eleccion.idEleccion },
    });
    const boleta = await this.boletaOrmRepository.findOne({
      where: { idEleccion: eleccion.idEleccion },
    });
    const categorias = boleta
      ? await this.categoriaOrmRepository.find({
          where: { idBoleta: boleta.idBoleta },
          order: { orden: 'ASC' },
        })
      : [];
    return mapEleccionToResponseDto(
      eleccion,
      categorias,
      config?.metodosAutenticacion ?? [],
    );
  }
}

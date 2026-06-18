// src/elections/elections.service.ts
import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfiguracionDatosCandidatoService } from './configuracion-datos-candidato.service';
import { Eleccion } from './entities/eleccion.entity';
import { CrearEleccionDto } from './dto/crear-eleccion.dto';
import { IEleccionService } from './interfaces/eleccion.service.interface';
import { ELECCION_REPOSITORY } from './interfaces/eleccion.repository.interface';
import type { IEleccionRepository } from './interfaces/eleccion.repository.interface';

@Injectable()
export class EleccionesService implements IEleccionService {
  constructor(
    @Inject(ELECCION_REPOSITORY)
    private readonly eleccionRepository: IEleccionRepository,
    @InjectRepository(Eleccion)
    private readonly eleccionOrmRepository: Repository<Eleccion>,
    private readonly configuracionDatosCandidatoService: ConfiguracionDatosCandidatoService,
  ) {}

  async crearEleccion(dto: CrearEleccionDto): Promise<Eleccion> {
    const ahora = new Date();
    const fechaInicio = new Date(dto.fechaInicio);
    const fechaFin = new Date(dto.fechaFin);

    if (fechaInicio <= ahora) {
      throw new UnprocessableEntityException(
        'La fecha de inicio debe ser posterior al momento actual.',
      );
    }

    if (fechaFin <= fechaInicio) {
      throw new UnprocessableEntityException(
        'La fecha de cierre debe ser posterior a la fecha de inicio.',
      );
    }

    const eleccion = await this.eleccionRepository.crear(dto);
    await this.configuracionDatosCandidatoService.crearConfiguracionPorDefecto(
      eleccion.idEleccion,
    );
    return eleccion;
  }

  async listarElecciones(): Promise<Eleccion[]> {
    return this.eleccionOrmRepository.find({
      order: { idEleccion: 'DESC' },
    });
  }

  async obtenerPorId(idEleccion: number): Promise<Eleccion> {
    const eleccion = await this.eleccionOrmRepository.findOne({
      where: { idEleccion },
    });
    if (!eleccion) {
      throw new NotFoundException(`Elección ${idEleccion} no encontrada`);
    }
    return eleccion;
  }
}

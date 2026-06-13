// src/elections/elections.service.ts
import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Eleccion } from './entities/eleccion.entity';
import { CrearEleccionDto } from './dto/crear-eleccion.dto';
import { IEleccionService } from './intefaces/eleccion.service.interface';
import { ELECCION_REPOSITORY } from './intefaces/eleccion.repository.interface';
import type { IEleccionRepository } from './intefaces/eleccion.repository.interface';

@Injectable()
export class EleccionesService implements IEleccionService {
  constructor(
    @Inject(ELECCION_REPOSITORY)
    private readonly eleccionRepository: IEleccionRepository,
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

    return this.eleccionRepository.crear(dto);
  }
}
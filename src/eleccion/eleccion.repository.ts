import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IEleccionRepository } from './interfaces/eleccion.repository.interface';
import { Eleccion } from './entities/eleccion.entity';
import { CrearEleccionDto } from './dto/crear-eleccion.dto';
import { EleccionEstado } from './enums/eleccion-estado.enum';


@Injectable()
export class EleccionRepository implements IEleccionRepository {
  constructor(
    @InjectRepository(Eleccion)
    private readonly repository: Repository<Eleccion>,
  ) {}

  async crear(dto: CrearEleccionDto): Promise<Eleccion> {
    const eleccion = this.repository.create({
      nombre: dto.nombre,
      descripcion: dto.descripcion,
      fechaInicio: new Date(dto.fechaInicio),
      fechaFin: new Date(dto.fechaFin),
      estado: EleccionEstado.BORRADOR,
    });

    return this.repository.save(eleccion);
  }
}
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IEleccionRepository } from '@/eleccion/interfaces/eleccion.repository.interface';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { CrearEleccionDto } from '@/eleccion/dto/crear-eleccion.dto';
import { parseUtcDateTime } from '@/common/utils/parse-utc-datetime.util';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';

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
      fechaInicio: parseUtcDateTime(dto.fechaInicio),
      fechaFin: parseUtcDateTime(dto.fechaFin),
      estado: EleccionEstado.BORRADOR,
    });

    return this.repository.save(eleccion);
  }
}

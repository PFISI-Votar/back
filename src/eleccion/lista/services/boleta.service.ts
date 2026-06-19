import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EstadoBoleta } from '@/eleccion/lista/enums/estado-boleta.enum';

@Injectable()
export class BoletaService {
  constructor(
    @InjectRepository(Boleta)
    private readonly boletaRepository: Repository<Boleta>,
    @InjectRepository(Categoria)
    private readonly categoriaRepository: Repository<Categoria>,
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
  ) {}

  async ensureBoleta(idEleccion: number): Promise<Boleta> {
    const existingBoleta = await this.boletaRepository.findOne({
      where: { idEleccion },
      relations: ['categorias'],
    });
    if (existingBoleta) {
      return existingBoleta;
    }
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });
    if (!eleccion) {
      throw new NotFoundException(`Elección ${idEleccion} no encontrada`);
    }
    const boleta = this.boletaRepository.create({
      idEleccion,
      titulo: `Boleta — ${eleccion.nombre}`,
      estado: EstadoBoleta.BORRADOR,
    });
    const savedBoleta = await this.boletaRepository.save(boleta);
    const categoria = this.categoriaRepository.create({
      idBoleta: savedBoleta.idBoleta,
      nombre: 'General',
      descripcion: 'Categoría general',
      cantidadCargos: 1,
      orden: 1,
    });
    await this.categoriaRepository.save(categoria);
    return this.boletaRepository.findOneOrFail({
      where: { idBoleta: savedBoleta.idBoleta },
      relations: ['categorias'],
    });
  }

  async findBoletaByEleccion(idEleccion: number): Promise<Boleta | null> {
    return this.boletaRepository.findOne({
      where: { idEleccion },
      relations: ['categorias'],
    });
  }
}

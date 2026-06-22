import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { CrearCategoriaDto } from './dto/crear-categoria.dto';
import type { ICategoriaRepository } from './interfaces/categoria.repository.interface';

@Injectable()
export class CategoriaRepository implements ICategoriaRepository {
  constructor(
    @InjectRepository(Categoria)
    private readonly repository: Repository<Categoria>,
    @InjectRepository(Boleta)
    private readonly boletaRepository: Repository<Boleta>,
  ) {}

  async crear(idEleccion: number, dto: CrearCategoriaDto): Promise<Categoria> {
    const boleta = await this.boletaRepository.findOne({ where: { idEleccion } });
    if (!boleta) {
      throw new Error(`No existe boleta para la elección ${idEleccion}`);
    }
    const categoria = this.repository.create({
      idBoleta: boleta.idBoleta,
      nombre: dto.nombre,
      descripcion: dto.descripcion,
      cantidadCargos: dto.cantidadCargos ?? 1,
      orden: dto.orden ?? 1,
    });
    return this.repository.save(categoria);
  }

  async findByEleccion(idEleccion: number): Promise<Categoria[]> {
    return this.repository
      .createQueryBuilder('c')
      .innerJoin('c.boleta', 'b')
      .where('b.id_eleccion = :idEleccion', { idEleccion })
      .orderBy('c.orden', 'ASC')
      .getMany();
  }

  async findById(idCategoria: number): Promise<Categoria | null> {
    return this.repository.findOne({ where: { idCategoria } });
  }

  async tieneCeroListasOficializadas(_idEleccion: number): Promise<boolean> {
    // TODO: implementar JOIN con lista cuando esté disponible (HU-318)
    throw new Error('tieneCeroListasOficializadas: no implementado hasta HU-318');
  }
}
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { ActualizarCategoriaDto } from './dto/actualizar-categoria.dto';
import { CrearCategoriaDto } from './dto/crear-categoria.dto';
import type { ICategoriaRepository } from './interfaces/categoria.repository.interface';

type CategoriaUsageRow = {
  count: string;
};

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
      throw new NotFoundException(
        `No existe boleta para la elección ${idEleccion}`,
      );
    }
    const categoriasExistentes = await this.findByEleccion(idEleccion);
    const maxOrden = categoriasExistentes.reduce(
      (max, categoria) => Math.max(max, categoria.orden),
      0,
    );
    const categoria = this.repository.create({
      idBoleta: boleta.idBoleta,
      nombre: dto.nombre,
      descripcion: dto.descripcion ?? null,
      cantidadCargos: dto.maximoPostulantes,
      minimoPostulantes: dto.minimoPostulantes ?? 0,
      orden: dto.orden ?? maxOrden + 1,
    });
    return this.repository.save(categoria);
  }

  async actualizar(
    idEleccion: number,
    idCategoria: number,
    dto: ActualizarCategoriaDto,
  ): Promise<Categoria> {
    const categoria = await this.findByIdAndEleccion(idEleccion, idCategoria);
    if (!categoria) {
      throw new NotFoundException(
        `No se encontró la categoría ${idCategoria} en la elección ${idEleccion}.`,
      );
    }
    if (dto.nombre !== undefined) {
      categoria.nombre = dto.nombre;
    }
    if (dto.descripcion !== undefined) {
      categoria.descripcion = dto.descripcion ?? null;
    }
    if (dto.minimoPostulantes !== undefined) {
      categoria.minimoPostulantes = dto.minimoPostulantes;
    }
    if (dto.maximoPostulantes !== undefined) {
      categoria.cantidadCargos = dto.maximoPostulantes;
    }
    if (dto.orden !== undefined) {
      categoria.orden = dto.orden;
    }
    return this.repository.save(categoria);
  }

  async eliminar(idEleccion: number, idCategoria: number): Promise<void> {
    const categoria = await this.findByIdAndEleccion(idEleccion, idCategoria);
    if (!categoria) {
      throw new NotFoundException(
        `No se encontró la categoría ${idCategoria} en la elección ${idEleccion}.`,
      );
    }
    await this.repository.remove(categoria);
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

  async findByIdAndEleccion(
    idEleccion: number,
    idCategoria: number,
  ): Promise<Categoria | null> {
    return this.repository
      .createQueryBuilder('c')
      .innerJoin('c.boleta', 'b')
      .where('b.id_eleccion = :idEleccion', { idEleccion })
      .andWhere('c.id_categoria = :idCategoria', { idCategoria })
      .getOne();
  }

  async tieneCeroListasOficializadas(idEleccion: number): Promise<boolean> {
    const categoriasDesiertas = await this.repository
      .createQueryBuilder('c')
      .innerJoin('c.boleta', 'b')
      .where('b.id_eleccion = :idEleccion', { idEleccion })
      .andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('1')
          .from(Candidato, 'cand')
          .innerJoin('cand.lista', 'l')
          .where('l.id_boleta = b.id_boleta')
          .andWhere('cand.id_categoria = c.id_categoria')
          .getQuery();
        return `NOT EXISTS ${subQuery}`;
      })
      .getCount();
    return categoriasDesiertas > 0;
  }

  async obtenerMaximoUsoEnLista(idCategoria: number): Promise<number> {
    const row = await this.repository.manager
      .createQueryBuilder(Candidato, 'candidato')
      .select('COUNT(*)', 'count')
      .where('candidato.id_categoria = :idCategoria', { idCategoria })
      .groupBy('candidato.id_lista')
      .orderBy('count', 'DESC')
      .limit(1)
      .getRawOne<CategoriaUsageRow>();
    return row ? Number(row.count) : 0;
  }

  async contarCandidatos(idCategoria: number): Promise<number> {
    return this.repository.manager.count(Candidato, {
      where: { idCategoria },
    });
  }
}

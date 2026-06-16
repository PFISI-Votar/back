import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Categoria } from './entities/categoria.entity';
import { CrearCategoriaDto } from './dto/crear-categoria.dto';
import { ICategoriaRepository } from './interfaces/categoria.repository.interface';

@Injectable()
export class CategoriaRepository implements ICategoriaRepository {
  constructor(
    @InjectRepository(Categoria)
    private readonly repository: Repository<Categoria>,
  ) {}

  async crear(idEleccion: number, dto: CrearCategoriaDto): Promise<Categoria> {
    const categoria = this.repository.create({
      idEleccion,
      nombre: dto.nombre,
      descripcion: dto.descripcion,
      cantidadCargos: dto.cantidadCargos ?? 1,
      orden: dto.orden ?? 1,
    });
    return this.repository.save(categoria);
  }

  async findByEleccion(idEleccion: number): Promise<Categoria[]> {
    return this.repository.find({
      where: { idEleccion },
      order: { orden: 'ASC' },
    });
  }

  async findById(idCategoria: number): Promise<Categoria | null> {
    return this.repository.findOne({ where: { idCategoria } });
  }

  /**
   * Retorna true si alguna categoría de la elección tiene cero listas oficializadas.
   * Usado por la HU 317 CA-3: bloqueo de oficialización por categoría desierta.
   * La lógica completa de "lista oficializada" se completará en HU 318.
   
  async tieneCeroListasOficializadas(idEleccion: number): Promise<boolean> {
    const resultado = await this.repository
      .createQueryBuilder('c')
      .leftJoin(
        'lista',
        'l',
        "l.id_eleccion = c.id_eleccion AND l.id_categoria = c.id_categoria AND l.estado = 'OFICIALIZADA'",
      )
      .where('c.id_eleccion = :idEleccion', { idEleccion })
      .groupBy('c.id_categoria')
      .having('COUNT(l.id_lista) = 0')
      .getCount();

    return resultado > 0;
    */
  async tieneCeroListasOficializadas(_idEleccion: number): Promise<boolean> {
    // TODO: implementar JOIN con lista cuando esté disponible (HU 318)
    throw new Error('tieneCeroListasOficializadas: no implementado hasta HU 318');
  }
}
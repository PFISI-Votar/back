import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EstadoBoleta } from '@/eleccion/lista/enums/estado-boleta.enum';
import { RolCandidatoDto } from '@/eleccion/lista/dto/rol-candidato.dto';
import { mapRolDtoToCategoriaEntity } from '@/eleccion/lista/mappers/categoria.mapper';

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

  async crearBoletaConCategorias(
    idEleccion: number,
    titulo: string,
    roles: RolCandidatoDto[],
  ): Promise<Boleta> {
    const boleta = await this.boletaRepository.save(
      this.boletaRepository.create({
        idEleccion,
        titulo,
        estado: EstadoBoleta.BORRADOR,
      }),
    );
    await this.categoriaRepository.save(
      roles.map((rol, index) =>
        this.categoriaRepository.create(
          mapRolDtoToCategoriaEntity(rol, boleta.idBoleta, index + 1),
        ),
      ),
    );
    return this.boletaRepository.findOneOrFail({
      where: { idBoleta: boleta.idBoleta },
      relations: ['categorias'],
    });
  }

  async ensureBoleta(idEleccion: number): Promise<Boleta> {
    const existingBoleta = await this.boletaRepository.findOne({
      where: { idEleccion },
      relations: ['categorias'],
    });
    if (existingBoleta) {
      if (existingBoleta.categorias?.length > 0) {
        return existingBoleta;
      }
      const categoria = this.categoriaRepository.create({
        idBoleta: existingBoleta.idBoleta,
        nombre: 'General',
        descripcion: 'Categoría general',
        cantidadCargos: 1,
        orden: 1,
      });
      await this.categoriaRepository.save(categoria);
      return this.boletaRepository.findOneOrFail({
        where: { idBoleta: existingBoleta.idBoleta },
        relations: ['categorias'],
      });
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

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BoletaService } from './boleta.service';
import { CreateListaDto, UpdateListaDto } from './dto/lista.dto';
import { ListaResponseDto } from './dto/lista-response.dto';
import { Boleta } from './entities/boleta.entity';
import { Eleccion } from './entities/eleccion.entity';
import { Lista } from './entities/lista.entity';
import { EstadoLista } from './enums/estado-lista.enum';
import { assertEleccionEditable } from './utils/eleccion-editable.util';

@Injectable()
export class ListaService {
  constructor(
    @InjectRepository(Lista)
    private readonly listaRepository: Repository<Lista>,
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    private readonly boletaService: BoletaService,
  ) {}

  async create(idEleccion: number, dto: CreateListaDto): Promise<ListaResponseDto> {
    const eleccion = await this.findEleccionOrFail(idEleccion);
    assertEleccionEditable(eleccion);
    const boleta = await this.boletaService.ensureBoleta(idEleccion);
    const lista = this.listaRepository.create({
      idBoleta: boleta.idBoleta,
      nombre: dto.nombre,
      sigla: dto.sigla,
      color: dto.color ?? null,
      estado: EstadoLista.BORRADOR,
    });
    const saved = await this.listaRepository.save(lista);
    return this.toResponse(saved, false, boleta);
  }

  async findAllByEleccion(idEleccion: number): Promise<ListaResponseDto[]> {
    await this.findEleccionOrFail(idEleccion);
    const boleta = await this.boletaService.ensureBoleta(idEleccion);
    const listas = await this.listaRepository.find({
      where: { idBoleta: boleta.idBoleta },
      relations: ['candidatos'],
      order: { idLista: 'ASC' },
    });
    return listas.map((lista) => this.toResponse(lista, true, boleta));
  }

  async update(idLista: number, dto: UpdateListaDto): Promise<ListaResponseDto> {
    const lista = await this.findListaWithEleccionOrFail(idLista);
    assertEleccionEditable(lista.boleta.eleccion);
    if (dto.nombre !== undefined) {
      lista.nombre = dto.nombre;
    }
    if (dto.sigla !== undefined) {
      lista.sigla = dto.sigla;
    }
    if (dto.color !== undefined) {
      lista.color = dto.color;
    }
    const saved = await this.listaRepository.save(lista);
    const boletaWithCategorias = await this.boletaService.ensureBoleta(
      lista.boleta.eleccion.idEleccion,
    );
    return this.toResponse(saved, false, boletaWithCategorias);
  }

  async remove(idLista: number): Promise<void> {
    const lista = await this.findListaWithEleccionOrFail(idLista);
    assertEleccionEditable(lista.boleta.eleccion);
    await this.listaRepository.remove(lista);
  }

  async findListaWithEleccionOrFail(idLista: number): Promise<Lista> {
    const lista = await this.listaRepository.findOne({
      where: { idLista },
      relations: ['boleta', 'boleta.eleccion', 'candidatos'],
    });
    if (!lista) {
      throw new NotFoundException(`Lista ${idLista} no encontrada`);
    }
    return lista;
  }

  private async findEleccionOrFail(idEleccion: number): Promise<Eleccion> {
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });
    if (!eleccion) {
      throw new NotFoundException(`Elección ${idEleccion} no encontrada`);
    }
    return eleccion;
  }

  private toResponse(
    lista: Lista,
    includeCandidatos = false,
    boleta?: Boleta,
  ): ListaResponseDto {
    const idCategoriaDefault = boleta?.categorias?.[0]?.idCategoria;
    return {
      idLista: lista.idLista,
      idBoleta: lista.idBoleta,
      nombre: lista.nombre,
      sigla: lista.sigla,
      color: lista.color,
      estado: lista.estado,
      listId: lista.listId,
      fechaOficializacion: lista.fechaOficializacion,
      idCategoriaDefault,
      candidatos: includeCandidatos
        ? (lista.candidatos ?? []).map((candidato) => ({
            idCandidato: candidato.idCandidato,
            idLista: candidato.idLista,
            idCategoria: candidato.idCategoria,
            nombre: candidato.nombre,
            apellido: candidato.apellido,
            cargo: candidato.cargo,
            orden: candidato.orden,
            fotoUrl: candidato.fotoUrl,
            datosAdicionales: candidato.datosAdicionales,
          }))
        : undefined,
    };
  }
}

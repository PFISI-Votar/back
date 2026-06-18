import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CandidatoDatosValidatorService } from './candidato-datos-validator.service';
import { ConfiguracionDatosCandidatoService } from './configuracion-datos-candidato.service';
import { CreateCandidatoDto, UpdateCandidatoDto } from './dto/candidato.dto';
import { CandidatoResponseDto } from './dto/lista-response.dto';
import { Candidato } from './entities/candidato.entity';
import { Categoria } from './entities/categoria.entity';
import { ListaService } from './lista.service';
import { assertEleccionEditable } from './utils/eleccion-editable.util';

@Injectable()
export class CandidatoService {
  constructor(
    @InjectRepository(Candidato)
    private readonly candidatoRepository: Repository<Candidato>,
    @InjectRepository(Categoria)
    private readonly categoriaRepository: Repository<Categoria>,
    private readonly listaService: ListaService,
    private readonly configuracionDatosCandidatoService: ConfiguracionDatosCandidatoService,
    private readonly candidatoDatosValidatorService: CandidatoDatosValidatorService,
  ) {}

  async create(idLista: number, dto: CreateCandidatoDto): Promise<CandidatoResponseDto> {
    const lista = await this.listaService.findListaWithEleccionOrFail(idLista);
    assertEleccionEditable(lista.boleta.eleccion);
    await this.validateCategoriaBelongsToBoleta(dto.idCategoria, lista.idBoleta);
    const idEleccion = lista.boleta.eleccion.idEleccion;
    const campos =
      await this.configuracionDatosCandidatoService.obtenerCamposPorEleccion(idEleccion);
    this.candidatoDatosValidatorService.validateDatosAdicionales(
      campos,
      dto.datosAdicionales ?? {},
    );
    const candidato = this.candidatoRepository.create({
      idLista,
      idCategoria: dto.idCategoria,
      nombre: dto.nombre,
      apellido: dto.apellido,
      cargo: dto.cargo ?? null,
      orden: dto.orden ?? 1,
      fotoUrl: dto.fotoUrl ?? null,
      datosAdicionales: dto.datosAdicionales,
    });
    const saved = await this.candidatoRepository.save(candidato);
    return this.toResponse(saved);
  }

  async findAllByLista(idLista: number): Promise<CandidatoResponseDto[]> {
    await this.listaService.findListaWithEleccionOrFail(idLista);
    const candidatos = await this.candidatoRepository.find({
      where: { idLista },
      order: { orden: 'ASC', idCandidato: 'ASC' },
    });
    return candidatos.map((candidato) => this.toResponse(candidato));
  }

  async update(
    idCandidato: number,
    dto: UpdateCandidatoDto,
  ): Promise<CandidatoResponseDto> {
    const candidato = await this.findCandidatoWithEleccionOrFail(idCandidato);
    assertEleccionEditable(candidato.lista.boleta.eleccion);
    if (dto.idCategoria !== undefined) {
      await this.validateCategoriaBelongsToBoleta(
        dto.idCategoria,
        candidato.lista.idBoleta,
      );
      candidato.idCategoria = dto.idCategoria;
    }
    if (dto.nombre !== undefined) {
      candidato.nombre = dto.nombre;
    }
    if (dto.apellido !== undefined) {
      candidato.apellido = dto.apellido;
    }
    if (dto.cargo !== undefined) {
      candidato.cargo = dto.cargo;
    }
    if (dto.orden !== undefined) {
      candidato.orden = dto.orden;
    }
    if (dto.fotoUrl !== undefined) {
      candidato.fotoUrl = dto.fotoUrl;
    }
    if (dto.datosAdicionales !== undefined) {
      const idEleccion = candidato.lista.boleta.eleccion.idEleccion;
      const campos =
        await this.configuracionDatosCandidatoService.obtenerCamposPorEleccion(idEleccion);
      this.candidatoDatosValidatorService.validateDatosAdicionales(
        campos,
        dto.datosAdicionales,
      );
      candidato.datosAdicionales = dto.datosAdicionales;
    }
    const saved = await this.candidatoRepository.save(candidato);
    return this.toResponse(saved);
  }

  async remove(idCandidato: number): Promise<void> {
    const candidato = await this.findCandidatoWithEleccionOrFail(idCandidato);
    assertEleccionEditable(candidato.lista.boleta.eleccion);
    await this.candidatoRepository.remove(candidato);
  }

  private async findCandidatoWithEleccionOrFail(idCandidato: number): Promise<Candidato> {
    const candidato = await this.candidatoRepository.findOne({
      where: { idCandidato },
      relations: ['lista', 'lista.boleta', 'lista.boleta.eleccion'],
    });
    if (!candidato) {
      throw new NotFoundException(`Candidato ${idCandidato} no encontrado`);
    }
    return candidato;
  }

  private async validateCategoriaBelongsToBoleta(
    idCategoria: number,
    idBoleta: number,
  ): Promise<void> {
    const categoria = await this.categoriaRepository.findOne({
      where: { idCategoria, idBoleta },
    });
    if (!categoria) {
      throw new UnprocessableEntityException(
        'La categoría no pertenece a la boleta del comicio',
      );
    }
  }

  private toResponse(candidato: Candidato): CandidatoResponseDto {
    return {
      idCandidato: candidato.idCandidato,
      idLista: candidato.idLista,
      idCategoria: candidato.idCategoria,
      nombre: candidato.nombre,
      apellido: candidato.apellido,
      cargo: candidato.cargo,
      orden: candidato.orden,
      fotoUrl: candidato.fotoUrl,
      datosAdicionales: candidato.datosAdicionales,
    };
  }
}

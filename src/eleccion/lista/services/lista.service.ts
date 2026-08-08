import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BoletaService } from '@/eleccion/lista/services/boleta.service';
import { CreateListaDto, UpdateListaDto } from '@/eleccion/lista/dto/lista.dto';
import { ListaResponseDto } from '@/eleccion/lista/dto/lista-response.dto';
import { mapCategoriaToRolResponse } from '@/eleccion/lista/mappers/categoria.mapper';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { EstadoLista } from '@/eleccion/lista/enums/estado-lista.enum';
import { assertEleccionEditable } from '@/eleccion/utils/eleccion-editable.util';
import { ElectoralImageService } from '@/common/images/electoral-image.service';

@Injectable()
export class ListaService {
  constructor(
    @InjectRepository(Lista)
    private readonly listaRepository: Repository<Lista>,
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    private readonly boletaService: BoletaService,
    private readonly electoralImageService: ElectoralImageService,
  ) {}

  async create(
    idEleccion: number,
    dto: CreateListaDto,
  ): Promise<ListaResponseDto> {
    const eleccion = await this.findEleccionOrFail(idEleccion);
    assertEleccionEditable(eleccion);
    const boleta = await this.boletaService.ensureBoleta(idEleccion);
    await this.validateSiglaUnica(boleta.idBoleta, dto.sigla, null);
    const lista = this.listaRepository.create({
      idBoleta: boleta.idBoleta,
      nombre: dto.nombre,
      sigla: dto.sigla,
      color: dto.color ?? null,
      logoUrl: null,
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
      relations: ['candidatos', 'candidatos.categoria'],
      order: { idLista: 'ASC' },
    });
    return listas.map((lista) => this.toResponse(lista, true, boleta));
  }

  async update(
    idLista: number,
    dto: UpdateListaDto,
  ): Promise<ListaResponseDto> {
    const lista = await this.findListaWithEleccionOrFail(idLista);
    assertEleccionEditable(lista.boleta.eleccion);
    if (dto.sigla !== undefined && dto.sigla !== lista.sigla) {
      await this.validateSiglaUnica(lista.idBoleta, dto.sigla, idLista);
    }
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

  async updateLogo(
    idLista: number,
    file: Express.Multer.File,
  ): Promise<ListaResponseDto> {
    const lista = await this.findListaWithEleccionOrFail(idLista);
    assertEleccionEditable(lista.boleta.eleccion);

    const previousLogoUrl = lista.logoUrl;
    const nextLogoUrl = await this.electoralImageService.saveImage(
      file,
      'lista-logo',
    );

    try {
      lista.logoUrl = nextLogoUrl;
      const saved = await this.listaRepository.save(lista);
      await this.electoralImageService.deleteIfManagedUrl(previousLogoUrl);
      const boletaWithCategorias = await this.boletaService.ensureBoleta(
        lista.boleta.eleccion.idEleccion,
      );
      return this.toResponse(saved, false, boletaWithCategorias);
    } catch (error) {
      await this.electoralImageService.deleteIfManagedUrl(nextLogoUrl);
      throw error;
    }
  }

  async removeLogo(idLista: number): Promise<ListaResponseDto> {
    const lista = await this.findListaWithEleccionOrFail(idLista);
    assertEleccionEditable(lista.boleta.eleccion);

    const previousLogoUrl = lista.logoUrl;
    lista.logoUrl = null;
    const saved = await this.listaRepository.save(lista);
    await this.electoralImageService.deleteIfManagedUrl(previousLogoUrl);
    const boletaWithCategorias = await this.boletaService.ensureBoleta(
      lista.boleta.eleccion.idEleccion,
    );
    return this.toResponse(saved, false, boletaWithCategorias);
  }

  async remove(idLista: number): Promise<void> {
    const lista = await this.findListaWithEleccionOrFail(idLista);
    assertEleccionEditable(lista.boleta.eleccion);
    await this.listaRepository.remove(lista);
    await this.electoralImageService.deleteIfManagedUrl(lista.logoUrl);
    await Promise.all(
      (lista.candidatos ?? []).map((candidato) =>
        this.electoralImageService.deleteIfManagedUrl(candidato.fotoUrl),
      ),
    );
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

  private async validateSiglaUnica(
    idBoleta: number,
    sigla: string,
    excludeIdLista: number | null,
  ): Promise<void> {
    const existente = await this.listaRepository.findOne({
      where: { idBoleta, sigla },
    });
    if (existente && existente.idLista !== excludeIdLista) {
      throw new ConflictException(
        `Ya existe una lista con la sigla "${sigla}" en este comicio`,
      );
    }
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
    const roles = (boleta?.categorias ?? [])
      .slice()
      .sort((a, b) => a.orden - b.orden)
      .map(mapCategoriaToRolResponse);
    return {
      idLista: lista.idLista,
      idBoleta: lista.idBoleta,
      nombre: lista.nombre,
      sigla: lista.sigla,
      color: lista.color,
      logoUrl: lista.logoUrl,
      estado: lista.estado,
      listId: lista.listId,
      fechaOficializacion: lista.fechaOficializacion,
      idCategoriaDefault,
      roles,
      candidatos: includeCandidatos
        ? (lista.candidatos ?? []).map((candidato) => ({
            idCandidato: candidato.idCandidato,
            idLista: candidato.idLista,
            idCategoria: candidato.idCategoria,
            categoriaNombre: candidato.categoria?.nombre ?? undefined,
            nombre: candidato.nombre,
            apellido: candidato.apellido,
            orden: candidato.orden,
            fotoUrl: candidato.fotoUrl,
            datosAdicionales: candidato.datosAdicionales,
          }))
        : undefined,
    };
  }
}

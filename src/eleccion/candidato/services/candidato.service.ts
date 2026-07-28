import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CLAVES_DATOS_CANDIDATO_UNICOS } from '@/eleccion/candidato/constants/datos-candidato-unicos.constant';
import { DatosAdicionalesValidationException } from '@/eleccion/candidato/exceptions/datos-adicionales-validation.exception';
import { CampoCandidatoDefinicion } from '@/eleccion/candidato/interfaces/campo-candidato-definicion.interface';
import { CandidatoDatosValidatorService } from '@/eleccion/candidato/services/candidato-datos-validator.service';
import { ConfiguracionDatosCandidatoService } from '@/eleccion/candidato/services/configuracion-datos-candidato.service';
import {
  CreateCandidatoDto,
  UpdateCandidatoDto,
} from '@/eleccion/candidato/dto/candidato.dto';
import { CandidatoResponseDto } from '@/eleccion/candidato/dto/candidato-response.dto';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { ListaService } from '@/eleccion/lista/services/lista.service';
import { assertEleccionEditable } from '@/eleccion/utils/eleccion-editable.util';
import { ElectoralImageService } from '@/common/images/electoral-image.service';

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
    private readonly electoralImageService: ElectoralImageService,
  ) {}

  async create(
    idLista: number,
    dto: CreateCandidatoDto,
  ): Promise<CandidatoResponseDto> {
    const lista = await this.listaService.findListaWithEleccionOrFail(idLista);
    assertEleccionEditable(lista.boleta.eleccion);
    const categoria = await this.validateCategoriaBelongsToBoleta(
      dto.idCategoria,
      lista.idBoleta,
    );
    await this.validateMaxPostulantesPorRol(idLista, categoria, null);
    const idEleccion = lista.boleta.eleccion.idEleccion;
    const campos =
      await this.configuracionDatosCandidatoService.obtenerCamposPorEleccion(
        idEleccion,
      );
    const datosAdicionales = dto.datosAdicionales ?? {};
    this.candidatoDatosValidatorService.validateDatosAdicionales(
      campos,
      datosAdicionales,
    );
    await this.validateDatosAdicionalesUnicos(
      idEleccion,
      datosAdicionales,
      campos,
      null,
    );
    const candidato = this.candidatoRepository.create({
      idLista,
      idCategoria: dto.idCategoria,
      nombre: dto.nombre,
      apellido: dto.apellido,
      orden: dto.orden ?? 1,
      fotoUrl: null,
      datosAdicionales: dto.datosAdicionales,
    });
    const saved = await this.candidatoRepository.save(candidato);
    return this.toResponse(
      await this.findCandidatoWithCategoriaOrFail(saved.idCandidato),
    );
  }

  async findAllByLista(idLista: number): Promise<CandidatoResponseDto[]> {
    await this.listaService.findListaWithEleccionOrFail(idLista);
    const candidatos = await this.candidatoRepository.find({
      where: { idLista },
      relations: ['categoria'],
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
      const categoria = await this.validateCategoriaBelongsToBoleta(
        dto.idCategoria,
        candidato.lista.idBoleta,
      );
      await this.validateMaxPostulantesPorRol(
        candidato.idLista,
        categoria,
        candidato.idCandidato,
      );
      candidato.idCategoria = dto.idCategoria;
    }
    if (dto.nombre !== undefined) {
      candidato.nombre = dto.nombre;
    }
    if (dto.apellido !== undefined) {
      candidato.apellido = dto.apellido;
    }
    if (dto.orden !== undefined) {
      candidato.orden = dto.orden;
    }
    if (dto.datosAdicionales !== undefined) {
      const idEleccion = candidato.lista.boleta.eleccion.idEleccion;
      const campos =
        await this.configuracionDatosCandidatoService.obtenerCamposPorEleccion(
          idEleccion,
        );
      this.candidatoDatosValidatorService.validateDatosAdicionales(
        campos,
        dto.datosAdicionales,
      );
      await this.validateDatosAdicionalesUnicos(
        idEleccion,
        dto.datosAdicionales,
        campos,
        candidato.idCandidato,
      );
      candidato.datosAdicionales = dto.datosAdicionales;
    }
    const saved = await this.candidatoRepository.save(candidato);
    return this.toResponse(
      await this.findCandidatoWithCategoriaOrFail(saved.idCandidato),
    );
  }

  async updateFoto(
    idCandidato: number,
    file: Express.Multer.File,
  ): Promise<CandidatoResponseDto> {
    const candidato = await this.findCandidatoWithEleccionOrFail(idCandidato);
    assertEleccionEditable(candidato.lista.boleta.eleccion);

    const previousFotoUrl = candidato.fotoUrl;
    const nextFotoUrl = await this.electoralImageService.saveImage(
      file,
      'candidato-foto',
    );

    try {
      candidato.fotoUrl = nextFotoUrl;
      const saved = await this.candidatoRepository.save(candidato);
      await this.electoralImageService.deleteIfManagedUrl(previousFotoUrl);
      return this.toResponse(
        await this.findCandidatoWithCategoriaOrFail(saved.idCandidato),
      );
    } catch (error) {
      await this.electoralImageService.deleteIfManagedUrl(nextFotoUrl);
      throw error;
    }
  }

  async removeFoto(idCandidato: number): Promise<CandidatoResponseDto> {
    const candidato = await this.findCandidatoWithEleccionOrFail(idCandidato);
    assertEleccionEditable(candidato.lista.boleta.eleccion);

    const previousFotoUrl = candidato.fotoUrl;
    candidato.fotoUrl = null;
    const saved = await this.candidatoRepository.save(candidato);
    await this.electoralImageService.deleteIfManagedUrl(previousFotoUrl);
    return this.toResponse(
      await this.findCandidatoWithCategoriaOrFail(saved.idCandidato),
    );
  }

  async remove(idCandidato: number): Promise<void> {
    const candidato = await this.findCandidatoWithEleccionOrFail(idCandidato);
    assertEleccionEditable(candidato.lista.boleta.eleccion);
    await this.candidatoRepository.remove(candidato);
    await this.electoralImageService.deleteIfManagedUrl(candidato.fotoUrl);
  }

  private async findCandidatoWithEleccionOrFail(
    idCandidato: number,
  ): Promise<Candidato> {
    const candidato = await this.candidatoRepository.findOne({
      where: { idCandidato },
      relations: ['lista', 'lista.boleta', 'lista.boleta.eleccion'],
    });
    if (!candidato) {
      throw new NotFoundException(`Candidato ${idCandidato} no encontrado`);
    }
    return candidato;
  }

  private async findCandidatoWithCategoriaOrFail(
    idCandidato: number,
  ): Promise<Candidato> {
    const candidato = await this.candidatoRepository.findOne({
      where: { idCandidato },
      relations: ['categoria'],
    });
    if (!candidato) {
      throw new NotFoundException(`Candidato ${idCandidato} no encontrado`);
    }
    return candidato;
  }

  private async validateCategoriaBelongsToBoleta(
    idCategoria: number,
    idBoleta: number,
  ): Promise<Categoria> {
    const categoria = await this.categoriaRepository.findOne({
      where: { idCategoria, idBoleta },
    });
    if (!categoria) {
      throw new UnprocessableEntityException(
        'El rol seleccionado no pertenece a la boleta del comicio',
      );
    }
    return categoria;
  }

  private async validateMaxPostulantesPorRol(
    idLista: number,
    categoria: Categoria,
    excludeCandidatoId: number | null,
  ): Promise<void> {
    const query = this.candidatoRepository
      .createQueryBuilder('candidato')
      .where('candidato.id_lista = :idLista', { idLista })
      .andWhere('candidato.id_categoria = :idCategoria', {
        idCategoria: categoria.idCategoria,
      });
    if (excludeCandidatoId !== null) {
      query.andWhere('candidato.id_candidato != :excludeCandidatoId', {
        excludeCandidatoId,
      });
    }
    const count = await query.getCount();
    if (count >= categoria.cantidadCargos) {
      throw new UnprocessableEntityException(
        `Se alcanzó el máximo de ${categoria.cantidadCargos} postulante(s) para el rol "${categoria.nombre}" en esta lista`,
      );
    }
  }

  private async validateDatosAdicionalesUnicos(
    idEleccion: number,
    datos: Record<string, unknown>,
    campos: CampoCandidatoDefinicion[],
    excludeCandidatoId: number | null,
  ): Promise<void> {
    const camposUnicos = campos.filter((campo) =>
      CLAVES_DATOS_CANDIDATO_UNICOS.includes(
        campo.clave as (typeof CLAVES_DATOS_CANDIDATO_UNICOS)[number],
      ),
    );
    if (camposUnicos.length === 0) {
      return;
    }

    const candidatosExistentes = await this.candidatoRepository
      .createQueryBuilder('candidato')
      .innerJoin('candidato.lista', 'lista')
      .innerJoin('lista.boleta', 'boleta')
      .where('boleta.idEleccion = :idEleccion', { idEleccion })
      .getMany();

    const errors = camposUnicos.flatMap((campo) => {
      const valor = datos[campo.clave];
      if (this.isEmptyDatoAdicional(valor)) {
        return [];
      }
      const valorNormalizado = this.normalizeDatoAdicionalUnico(valor);
      const duplicado = candidatosExistentes.some(
        (candidato) =>
          candidato.idCandidato !== excludeCandidatoId &&
          this.normalizeDatoAdicionalUnico(
            candidato.datosAdicionales?.[campo.clave],
          ) === valorNormalizado,
      );
      if (!duplicado) {
        return [];
      }
      return [
        {
          clave: campo.clave,
          message: `Ya existe un candidato con este ${campo.etiqueta.toLowerCase()} en el comicio`,
        },
      ];
    });

    if (errors.length > 0) {
      throw new DatosAdicionalesValidationException(errors);
    }
  }

  private isEmptyDatoAdicional(valor: unknown): boolean {
    return (
      valor === undefined ||
      valor === null ||
      (typeof valor === 'string' && valor.trim() === '')
    );
  }

  private normalizeDatoAdicionalUnico(valor: unknown): string {
    if (typeof valor === 'string') {
      return valor.trim().toLocaleLowerCase();
    }
    if (typeof valor === 'number' || typeof valor === 'boolean') {
      return String(valor).toLocaleLowerCase();
    }
    return '';
  }

  private toResponse(candidato: Candidato): CandidatoResponseDto {
    return {
      idCandidato: candidato.idCandidato,
      idLista: candidato.idLista,
      idCategoria: candidato.idCategoria,
      categoriaNombre: candidato.categoria?.nombre,
      nombre: candidato.nombre,
      apellido: candidato.apellido,
      orden: candidato.orden,
      fotoUrl: candidato.fotoUrl,
      datosAdicionales: candidato.datosAdicionales,
    };
  }
}

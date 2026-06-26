import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { EstadoBoleta } from '@/eleccion/lista/enums/estado-boleta.enum';
import { EstadoLista } from '@/eleccion/lista/enums/estado-lista.enum';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';
import { PadronVotante } from '@/padron/entities/padron-votante.entity';
import { BudConfigResponseDto } from '@/voto/dto/bud-config-response.dto';
import {
  BoletaDigitalResponseDto,
  CandidatoBoletaDigitalDto,
  CategoriaBoletaDigitalDto,
  CategoriaBoletaEstado,
} from '@/voto/dto/boleta-digital-response.dto';
import {
  ConfirmarVotoDto,
  SeleccionVotoDto,
} from '@/voto/dto/confirmar-voto.dto';
import { ConfirmarVotoResponseDto } from '@/voto/dto/confirmar-voto-response.dto';
import {
  VotoConfirmacion,
  VotoConfirmacionEstado,
} from '@/voto/entities/voto-confirmacion.entity';

type OfertaVoto = {
  eleccion: Eleccion;
  configuracion: ConfiguracionComicio;
  boleta: Boleta;
  categorias: Categoria[];
  listas: Lista[];
};

const ESTADOS_ELECCION_APTOS = [
  EleccionEstado.CONFIGURADA,
  EleccionEstado.ABIERTA,
];

@Injectable()
export class VotoService {
  constructor(
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    @InjectRepository(ConfiguracionComicio)
    private readonly configuracionRepository: Repository<ConfiguracionComicio>,
    @InjectRepository(Boleta)
    private readonly boletaRepository: Repository<Boleta>,
    @InjectRepository(Lista)
    private readonly listaRepository: Repository<Lista>,
    @InjectRepository(PadronVotante)
    private readonly padronVotanteRepository: Repository<PadronVotante>,
    @InjectRepository(VotoConfirmacion)
    private readonly votoConfirmacionRepository: Repository<VotoConfirmacion>,
  ) {}

  async obtenerConfiguracionBud(
    idEleccion: number,
  ): Promise<BudConfigResponseDto> {
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });
    if (!eleccion) {
      throw new NotFoundException('Comicio no encontrado');
    }
    const configuracion = await this.configuracionRepository.findOne({
      where: { idEleccion },
    });
    if (!configuracion) {
      throw new NotFoundException('Configuración del comicio no encontrada');
    }
    return {
      idEleccion: eleccion.idEleccion,
      nombre: eleccion.nombre,
      estado: eleccion.estado,
      tipoVotacion: eleccion.tipoVotacion,
      metodosAutenticacion: configuracion.metodosAutenticacion,
    };
  }

  async obtenerBoletaDigital(
    idEleccion: number,
    votanteHash: string,
  ): Promise<BoletaDigitalResponseDto> {
    await this.assertVotanteHabilitado(idEleccion, votanteHash);
    const oferta = await this.obtenerOfertaVoto(idEleccion);

    return {
      idEleccion: oferta.eleccion.idEleccion,
      nombreEleccion: oferta.eleccion.nombre,
      estadoEleccion: oferta.eleccion.estado,
      idBoleta: oferta.boleta.idBoleta,
      titulo: oferta.boleta.titulo,
      permitirVotoEnBlanco: oferta.configuracion.permitirVotoEnBlanco,
      categorias: this.mapCategorias(oferta),
    };
  }

  async confirmarVoto(
    idEleccion: number,
    dto: ConfirmarVotoDto,
    votanteHash: string,
  ): Promise<ConfirmarVotoResponseDto> {
    await this.assertVotanteHabilitado(idEleccion, votanteHash);
    const oferta = await this.obtenerOfertaVoto(idEleccion);
    this.validarSelecciones(oferta, dto);

    const payloadHash = this.hashPayload({
      idEleccion,
      votoEnBlanco: dto.votoEnBlanco === true,
      selecciones: this.normalizarSelecciones(dto.selecciones),
    });

    const existentePorClave = await this.votoConfirmacionRepository.findOne({
      where: { idEleccion, idempotencyKey: dto.idempotencyKey },
    });

    if (existentePorClave) {
      if (
        existentePorClave.votanteHash !== votanteHash ||
        existentePorClave.payloadHash !== payloadHash
      ) {
        throw new ConflictException(
          'La clave idempotente ya fue utilizada con otro voto',
        );
      }
      return this.toConfirmacionResponse(existentePorClave, true);
    }

    const existentePorVotante = await this.votoConfirmacionRepository.findOne({
      where: { idEleccion, votanteHash },
    });

    if (existentePorVotante) {
      throw new ConflictException('El votante ya confirmó su voto');
    }

    const comprobanteHash = this.hashPayload({
      idEleccion,
      votanteHash,
      idempotencyKey: dto.idempotencyKey,
      payloadHash,
    });

    try {
      const confirmacion = await this.votoConfirmacionRepository.save(
        this.votoConfirmacionRepository.create({
          idEleccion,
          votanteHash,
          idempotencyKey: dto.idempotencyKey,
          payloadHash,
          comprobanteHash,
          estado: VotoConfirmacionEstado.RECIBIDO,
        }),
      );

      return this.toConfirmacionResponse(confirmacion, false);
    } catch {
      throw new ConflictException('El voto ya fue confirmado');
    }
  }

  private async obtenerOfertaVoto(idEleccion: number): Promise<OfertaVoto> {
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });
    if (!eleccion) {
      throw new NotFoundException(`Elección ${idEleccion} no encontrada`);
    }
    if (!ESTADOS_ELECCION_APTOS.includes(eleccion.estado)) {
      throw new ForbiddenException('La elección no está habilitada para votar');
    }

    const configuracion = await this.configuracionRepository.findOne({
      where: { idEleccion },
    });
    if (!configuracion) {
      throw new NotFoundException(
        `Configuración del comicio ${idEleccion} no encontrada`,
      );
    }

    const boleta = await this.boletaRepository.findOne({
      where: { idEleccion },
      relations: ['categorias'],
    });
    if (!boleta) {
      throw new NotFoundException(
        `Boleta del comicio ${idEleccion} no encontrada`,
      );
    }
    if (boleta.estado !== EstadoBoleta.PUBLICADA) {
      throw new ForbiddenException('La boleta no está publicada');
    }

    const categorias = (boleta.categorias ?? [])
      .slice()
      .sort((a, b) => a.orden - b.orden || a.idCategoria - b.idCategoria);
    const listas = await this.listaRepository.find({
      where: { idBoleta: boleta.idBoleta, estado: EstadoLista.OFICIALIZADA },
      relations: ['candidatos'],
    });

    const listasOrdenadas = listas
      .filter((lista) => lista.listId !== null || lista.candidatos?.length > 0)
      .sort(
        (a, b) =>
          (a.listId ?? a.idLista) - (b.listId ?? b.idLista) ||
          a.idLista - b.idLista,
      )
      .map((lista) => ({
        ...lista,
        candidatos: (lista.candidatos ?? [])
          .slice()
          .sort((a, b) => a.orden - b.orden || a.idCandidato - b.idCandidato),
      })) as Lista[];

    return {
      eleccion,
      configuracion,
      boleta,
      categorias,
      listas: listasOrdenadas,
    };
  }

  private mapCategorias(oferta: OfertaVoto): CategoriaBoletaDigitalDto[] {
    return oferta.categorias.map((categoria) => {
      const candidatos = this.mapCandidatosPorCategoria(
        oferta.listas,
        categoria,
      );

      return {
        idCategoria: categoria.idCategoria,
        nombre: categoria.nombre,
        descripcion: categoria.descripcion,
        orden: categoria.orden,
        estado:
          candidatos.length > 0
            ? CategoriaBoletaEstado.DISPONIBLE
            : CategoriaBoletaEstado.SIN_CANDIDATOS,
        candidatos,
      };
    });
  }

  private mapCandidatosPorCategoria(
    listas: Lista[],
    categoria: Categoria,
  ): CandidatoBoletaDigitalDto[] {
    return listas.flatMap((lista) =>
      (lista.candidatos ?? [])
        .filter((candidato) => candidato.idCategoria === categoria.idCategoria)
        .map((candidato) => ({
          idCandidato: candidato.idCandidato,
          idCategoria: candidato.idCategoria,
          idLista: lista.idLista,
          listId: lista.listId ?? lista.idLista,
          nombre: candidato.nombre,
          apellido: candidato.apellido,
          nombreCompleto: `${candidato.nombre} ${candidato.apellido}`,
          agrupacionPolitica: lista.nombre,
          numeroLista: lista.listId ?? lista.idLista,
          colorLista: lista.color,
          logoListaUrl: lista.logoUrl,
          fotoUrl: candidato.fotoUrl,
        })),
    );
  }

  private validarSelecciones(oferta: OfertaVoto, dto: ConfirmarVotoDto): void {
    const selecciones = dto.selecciones ?? [];

    if (dto.votoEnBlanco === true) {
      if (!oferta.configuracion.permitirVotoEnBlanco) {
        throw new UnprocessableEntityException(
          'El comicio no permite voto en blanco',
        );
      }
      if (selecciones.length > 0) {
        throw new BadRequestException(
          'El voto en blanco no puede combinarse con candidatos',
        );
      }
      return;
    }

    if (selecciones.length === 0) {
      throw new UnprocessableEntityException(
        'Debe seleccionar al menos un candidato',
      );
    }

    const categoriasIds = new Set(
      oferta.categorias.map((categoria) => categoria.idCategoria),
    );
    const categoriasSeleccionadas = new Set<number>();

    for (const seleccion of selecciones) {
      if (categoriasSeleccionadas.has(seleccion.idCategoria)) {
        throw new BadRequestException(
          'Solo se permite una selección por categoría',
        );
      }
      categoriasSeleccionadas.add(seleccion.idCategoria);
      if (!categoriasIds.has(seleccion.idCategoria)) {
        throw new BadRequestException('La categoría seleccionada no existe');
      }
      if (!this.existeCandidatoEnOferta(oferta.listas, seleccion)) {
        throw new BadRequestException(
          'El candidato seleccionado no pertenece a la boleta',
        );
      }
    }

    const categoriasSinCandidatos = this.mapCategorias(oferta).filter(
      (categoria) => categoria.estado === CategoriaBoletaEstado.SIN_CANDIDATOS,
    );
    if (categoriasSinCandidatos.length > 0) {
      throw new UnprocessableEntityException(
        'La boleta contiene categorías sin candidatos disponibles',
      );
    }

    if (categoriasSeleccionadas.size !== oferta.categorias.length) {
      throw new UnprocessableEntityException(
        'Debe seleccionar un candidato por cada categoría',
      );
    }
  }

  private existeCandidatoEnOferta(
    listas: Lista[],
    seleccion: SeleccionVotoDto,
  ): boolean {
    return listas.some((lista) =>
      (lista.candidatos ?? []).some(
        (candidato: Candidato) =>
          candidato.idCandidato === seleccion.idCandidato &&
          candidato.idCategoria === seleccion.idCategoria,
      ),
    );
  }

  private normalizarSelecciones(
    selecciones: SeleccionVotoDto[],
  ): SeleccionVotoDto[] {
    return selecciones
      .slice()
      .sort(
        (a, b) =>
          a.idCategoria - b.idCategoria || a.idCandidato - b.idCandidato,
      );
  }

  private async assertVotanteHabilitado(
    idEleccion: number,
    votanteHash: string,
  ): Promise<void> {
    const count = await this.padronVotanteRepository
      .createQueryBuilder('votante')
      .innerJoin('votante.padron', 'padron')
      .innerJoin('padron.eleccion', 'eleccion')
      .where('eleccion.idEleccion = :idEleccion', { idEleccion })
      .andWhere('votante.hashHoja = :votanteHash', { votanteHash })
      .getCount();

    if (count === 0) {
      throw new ForbiddenException(
        'El votante no está habilitado para el comicio',
      );
    }
  }

  private hashPayload(payload: unknown): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private toConfirmacionResponse(
    confirmacion: VotoConfirmacion,
    idempotente: boolean,
  ): ConfirmarVotoResponseDto {
    return {
      idEleccion: confirmacion.idEleccion,
      estado: confirmacion.estado,
      comprobanteHash: confirmacion.comprobanteHash,
      payloadHash: confirmacion.payloadHash,
      recibidoEn: confirmacion.recibidoEn,
      idempotente,
    };
  }
}

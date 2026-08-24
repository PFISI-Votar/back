import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { EstadoLista } from '@/eleccion/lista/enums/estado-lista.enum';
import { PadronElectoral } from '@/padron/entities/padron-electoral.entity';
import { CandidatoEscrutinioDto } from '@/escrutinio/dto/candidato-escrutinio.dto';
import { EscrutinioResponseDto } from '@/escrutinio/dto/escrutinio-response.dto';
import { EscrutinioCacheService } from '@/escrutinio/services/escrutinio-cache.service';

const ESTADOS_ESCRUTINIO_VISIBLE: EleccionEstado[] = [
  EleccionEstado.ABIERTA,
  EleccionEstado.CERRADA,
  EleccionEstado.ESCRUTADA,
  // VOTAR-322: el Dashboard de resultados definitivos debe seguir
  // accesible públicamente tras archivar (archivado es off-chain).
  EleccionEstado.ARCHIVADA,
];

const ESTADOS_CERRADOS: EleccionEstado[] = [
  EleccionEstado.CERRADA,
  EleccionEstado.ESCRUTADA,
  EleccionEstado.ARCHIVADA,
];

@Injectable()
export class EscrutinioService {
  constructor(
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    @InjectRepository(ConfiguracionComicio)
    private readonly configuracionRepository: Repository<ConfiguracionComicio>,
    @InjectRepository(Boleta)
    private readonly boletaRepository: Repository<Boleta>,
    @InjectRepository(Lista)
    private readonly listaRepository: Repository<Lista>,
    @InjectRepository(Candidato)
    private readonly candidatoRepository: Repository<Candidato>,
    @InjectRepository(PadronElectoral)
    private readonly padronRepository: Repository<PadronElectoral>,
    private readonly blockchainService: BlockchainService,
    private readonly cacheService: EscrutinioCacheService,
  ) {}

  /**
   * Returns cached snapshot when available; otherwise builds and caches a fresh one.
   */
  async obtenerResultados(
    idEleccion: number,
    options: { forceRefresh?: boolean } = {},
  ): Promise<EscrutinioResponseDto> {
    if (!options.forceRefresh) {
      const cached = this.cacheService.get(idEleccion);
      if (cached) {
        return cached;
      }
    }
    const snapshot = await this.buildSnapshot(idEleccion);
    this.cacheService.set(idEleccion, snapshot);
    return snapshot;
  }

  /**
   * Rebuilds from on-chain + off-chain metadata. Used by the poller.
   * @returns whether the fingerprint changed vs previous cache.
   */
  async refreshAndDetectChange(idEleccion: number): Promise<{
    changed: boolean;
    snapshot: EscrutinioResponseDto;
  }> {
    const previousFingerprint = this.cacheService.getFingerprint(idEleccion);
    const snapshot = await this.buildSnapshot(idEleccion);
    const nextFingerprint = this.cacheService.buildFingerprint(snapshot);
    this.cacheService.set(idEleccion, snapshot);
    return {
      changed: previousFingerprint !== nextFingerprint,
      snapshot,
    };
  }

  async listarComiciosParaPolling(): Promise<number[]> {
    const elecciones = await this.eleccionRepository
      .createQueryBuilder('eleccion')
      .innerJoin(
        ConfiguracionComicio,
        'config',
        'config.idEleccion = eleccion.idEleccion',
      )
      .where('eleccion.estado = :estado', { estado: EleccionEstado.ABIERTA })
      .andWhere('config.mostrarResultadosTiempoReal = true')
      .select('eleccion.idEleccion', 'idEleccion')
      .getRawMany<{ idEleccion: number }>();
    return elecciones.map((row) => Number(row.idEleccion));
  }

  private async buildSnapshot(
    idEleccion: number,
  ): Promise<EscrutinioResponseDto> {
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });
    if (!eleccion) {
      throw new NotFoundException('Comicio no encontrado');
    }
    if (!ESTADOS_ESCRUTINIO_VISIBLE.includes(eleccion.estado)) {
      throw new UnprocessableEntityException(
        'El escrutinio solo está disponible cuando el comicio está abierto, cerrado o escrutado.',
      );
    }
    const configuracion = await this.configuracionRepository.findOne({
      where: { idEleccion },
    });
    if (!configuracion) {
      throw new NotFoundException('Configuración del comicio no encontrada');
    }
    const candidatos = await this.loadCandidatosOficiales(idEleccion);
    const candidateIds = candidatos.map((c) => c.idCandidato);
    const tallies = await this.blockchainService.fetchEscrutinioTallies(
      idEleccion,
      candidateIds,
    );
    const padron = await this.padronRepository.findOne({
      where: { eleccion: { idEleccion } },
    });
    const totalVotantesHabilitados = padron?.totalVotantesHabilitados ?? 0;
    const totalVotos = tallies.participation.totalVotes;
    const porcentajeParticipacion =
      totalVotantesHabilitados > 0
        ? Math.round((totalVotos / totalVotantesHabilitados) * 1000) / 10
        : 0;
    const candidatosDto: CandidatoEscrutinioDto[] = candidatos.map(
      (candidato) => {
        const votos = tallies.votesByCandidateId[candidato.idCandidato] ?? 0;
        const porcentaje =
          totalVotos > 0 ? Math.round((votos / totalVotos) * 1000) / 10 : 0;
        return {
          idCandidato: candidato.idCandidato,
          nombre: candidato.nombre,
          apellido: candidato.apellido,
          idLista: candidato.idLista,
          nombreLista: candidato.lista.nombre,
          siglaLista: candidato.lista.sigla,
          colorLista: candidato.lista.color,
          idCategoria: candidato.idCategoria,
          nombreCategoria: candidato.categoria.nombre,
          votos,
          porcentaje,
        };
      },
    );
    candidatosDto.sort(
      (a, b) =>
        b.votos - a.votos ||
        a.apellido.localeCompare(b.apellido) ||
        a.nombre.localeCompare(b.nombre),
    );
    const congelado =
      ESTADOS_CERRADOS.includes(eleccion.estado) ||
      !configuracion.mostrarResultadosTiempoReal;
    return {
      idEleccion: eleccion.idEleccion,
      nombre: eleccion.nombre,
      estado: eleccion.estado,
      tipoVotacion: eleccion.tipoVotacion,
      congelado,
      fuente: 'ON_CHAIN',
      actualizadoEn: new Date().toISOString(),
      participacion: {
        totalVotos,
        votosBlanco: tallies.participation.blankVotes,
        votosNulo: tallies.participation.nullVotes,
        totalVotantesHabilitados,
        porcentajeParticipacion,
      },
      candidatos: candidatosDto,
      permitirVotoNulo: configuracion.permitirVotoNulo,
    };
  }

  private async loadCandidatosOficiales(
    idEleccion: number,
  ): Promise<Candidato[]> {
    const boleta = await this.boletaRepository.findOne({
      where: { idEleccion },
    });
    if (!boleta) {
      return [];
    }
    const listas = await this.listaRepository.find({
      where: {
        idBoleta: boleta.idBoleta,
        estado: EstadoLista.OFICIALIZADA,
      },
    });
    if (listas.length === 0) {
      return [];
    }
    return this.candidatoRepository.find({
      where: { idLista: In(listas.map((lista) => lista.idLista)) },
      relations: ['lista', 'categoria'],
      order: { orden: 'ASC', idCandidato: 'ASC' },
    });
  }
}

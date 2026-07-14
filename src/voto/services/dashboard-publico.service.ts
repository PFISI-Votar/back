import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { TipoVotacion } from '@/eleccion/enums/tipo-votacion.enum';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { EstadoLista } from '@/eleccion/lista/enums/estado-lista.enum';
import { PadronService } from '@/padron/padron.service';
import {
  DashboardEscrutinioResponseDto,
  ResultadoCandidatoDto,
  ResultadoListaDto,
  ResultadosPublicosDto,
} from '@/voto/dto/dashboard-escrutinio-response.dto';

const ESTADOS_CON_RESULTADOS: EleccionEstado[] = [
  EleccionEstado.CERRADA,
  EleccionEstado.ESCRUTADA,
];

@Injectable()
export class DashboardPublicoService {
  constructor(
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    @InjectRepository(Boleta)
    private readonly boletaRepository: Repository<Boleta>,
    @InjectRepository(Lista)
    private readonly listaRepository: Repository<Lista>,
    private readonly blockchainService: BlockchainService,
    private readonly padronService: PadronService,
  ) {}

  async obtenerEscrutinio(
    idEleccion: number,
  ): Promise<DashboardEscrutinioResponseDto> {
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });
    if (!eleccion) {
      throw new NotFoundException(`Elección ${idEleccion} no encontrada`);
    }

    const [stats, padron] = await Promise.all([
      this.blockchainService.getParticipationStats(idEleccion),
      this.padronService.obtenerTotalVotantesPublico(idEleccion).catch(() => ({
        totalVotantesHabilitados: 0,
      })),
    ]);

    const totalVotantesHabilitados = padron.totalVotantesHabilitados;
    const porcentajeEscrutinio =
      totalVotantesHabilitados > 0
        ? Number(
            ((stats.totalVotes / totalVotantesHabilitados) * 100).toFixed(2),
          )
        : 0;

    const mostrarResultados = ESTADOS_CON_RESULTADOS.includes(eleccion.estado);
    const resultados = mostrarResultados
      ? await this.construirResultados(
          idEleccion,
          eleccion.tipoVotacion,
          stats.totalVotes,
          stats.blankVotes,
          stats.nullVotes,
        )
      : null;

    return {
      idEleccion,
      estado: eleccion.estado,
      tipoVotacion: eleccion.tipoVotacion,
      participacion: {
        votosFiscalizados: stats.totalVotes,
        votosEnBlanco: stats.blankVotes,
        votosNulos: stats.nullVotes,
        totalVotantesHabilitados,
        porcentajeEscrutinio,
      },
      resultados,
    };
  }

  private async construirResultados(
    idEleccion: number,
    tipoVotacion: TipoVotacion,
    totalVotes: number,
    blankVotes: number,
    nullVotes: number,
  ): Promise<ResultadosPublicosDto> {
    const boleta = await this.boletaRepository.findOne({
      where: { idEleccion },
    });
    if (!boleta) {
      return {
        porLista: [],
        porCandidato: [],
        votosEnBlanco: blankVotes,
        votosNulos: nullVotes,
      };
    }

    const listas = await this.listaRepository.find({
      where: { idBoleta: boleta.idBoleta, estado: EstadoLista.OFICIALIZADA },
      relations: ['candidatos', 'candidatos.categoria'],
      order: { idLista: 'ASC' },
    });

    const candidateVotes = new Map<number, number>();
    for (const lista of listas) {
      for (const candidato of lista.candidatos ?? []) {
        const votos = await this.blockchainService.getVotesByCandidate(
          idEleccion,
          candidato.idCandidato,
        );
        candidateVotes.set(candidato.idCandidato, votos);
      }
    }

    const pct = (votos: number) =>
      totalVotes > 0 ? Number(((votos / totalVotes) * 100).toFixed(2)) : 0;

    const porCandidato: ResultadoCandidatoDto[] = listas
      .flatMap((lista) =>
        (lista.candidatos ?? []).map((candidato) => {
          const votos = candidateVotes.get(candidato.idCandidato) ?? 0;
          return {
            idCandidato: candidato.idCandidato,
            nombre: candidato.nombre,
            apellido: candidato.apellido,
            idLista: lista.idLista,
            nombreLista: lista.nombre,
            idCategoria: candidato.idCategoria,
            nombreCategoria: candidato.categoria?.nombre ?? 'Sin categoría',
            votos,
            porcentaje: pct(votos),
          };
        }),
      )
      .sort((a, b) => b.votos - a.votos || a.idCandidato - b.idCandidato);

    const porLista: ResultadoListaDto[] = listas
      .map((lista) => {
        const votos = (lista.candidatos ?? []).reduce(
          (sum, candidato) =>
            sum + (candidateVotes.get(candidato.idCandidato) ?? 0),
          0,
        );
        return {
          idLista: lista.idLista,
          nombre: lista.nombre,
          sigla: lista.sigla,
          color: lista.color,
          votos,
          porcentaje: pct(votos),
        };
      })
      .sort((a, b) => b.votos - a.votos || a.idLista - b.idLista);

    if (tipoVotacion === TipoVotacion.POR_LISTA) {
      return {
        porLista,
        votosEnBlanco: blankVotes,
        votosNulos: nullVotes,
      };
    }

    if (tipoVotacion === TipoVotacion.POR_CANDIDATO) {
      return {
        porCandidato,
        votosEnBlanco: blankVotes,
        votosNulos: nullVotes,
      };
    }

    // MIXTO: ambas proyecciones
    return {
      porLista,
      porCandidato,
      votosEnBlanco: blankVotes,
      votosNulos: nullVotes,
    };
  }
}

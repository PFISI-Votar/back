import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { ParticipacionPublicaResponseDto } from '@/dashboard-publico/dto/participacion-publica-response.dto';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { OfertaElectoralQueryService } from '@/eleccion/lista/services/oferta-electoral-query.service';
import { PadronService } from '@/padron/padron.service';

const ESTADOS_ELECCION_CERRADOS = [
  EleccionEstado.CERRADA,
  EleccionEstado.ESCRUTADA,
];

const FUENTE_DATOS =
  'AuditViewContract.getParticipationStats + VoteRegistry.VoteCast';

@Injectable()
export class ParticipacionPublicService {
  constructor(
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    @InjectRepository(ConfiguracionComicio)
    private readonly configuracionRepository: Repository<ConfiguracionComicio>,
    private readonly padronService: PadronService,
    private readonly blockchainService: BlockchainService,
    private readonly ofertaElectoralQueryService: OfertaElectoralQueryService,
  ) {}

  async obtenerParticipacionPublica(
    idEleccion: number,
    horasVentana = 12,
  ): Promise<ParticipacionPublicaResponseDto> {
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

    const resultadosDefinitivos = ESTADOS_ELECCION_CERRADOS.includes(
      eleccion.estado,
    );
    const snapshotCongelado =
      resultadosDefinitivos || !configuracion.mostrarResultadosTiempoReal;

    const { totalVotantesHabilitados: totalPadron } =
      await this.padronService.obtenerTotalVotantesPublico(idEleccion);

    const stats =
      await this.blockchainService.getParticipationStats(idEleccion);
    const votosAfirmativos = Math.max(
      0,
      stats.totalVotes - stats.blankVotes - stats.nullVotes,
    );
    const totalSufragios =
      votosAfirmativos + stats.blankVotes + stats.nullVotes;
    const porcentajeParticipacion =
      totalPadron > 0
        ? Math.round((totalSufragios / totalPadron) * 1000) / 10
        : 0;

    const expresion = `(${votosAfirmativos} + ${stats.blankVotes} + ${stats.nullVotes}) / ${totalPadron} × 100 = ${porcentajeParticipacion}%`;

    const [serieTemporal, desglosePorCategoria] = await Promise.all([
      this.blockchainService.getVoteCastTimeline(idEleccion, horasVentana),
      this.buildDesglosePorCategoria(
        idEleccion,
        stats.blankVotes,
        stats.nullVotes,
      ),
    ]);

    const sumaListas = desglosePorCategoria.reduce(
      (acc, categoria) =>
        acc + categoria.listas.reduce((sum, lista) => sum + lista.votos, 0),
      0,
    );
    const totalCalculado = sumaListas + stats.blankVotes + stats.nullVotes;

    return {
      idEleccion,
      snapshotCongelado,
      formula: {
        totalPadron,
        votosAfirmativos,
        votosEnBlanco: stats.blankVotes,
        votosNulos: stats.nullVotes,
        totalSufragios,
        porcentajeParticipacion,
        expresion,
      },
      serieTemporal,
      desglosePorCategoria,
      verificacionTotales: {
        coherente: totalCalculado === stats.totalVotes,
        totalOnChain: stats.totalVotes,
        totalCalculado,
      },
      fuenteDatos: FUENTE_DATOS,
    };
  }

  private async buildDesglosePorCategoria(
    idEleccion: number,
    blankVotes: number,
    nullVotes: number,
  ) {
    const oferta =
      await this.ofertaElectoralQueryService.obtenerOfertaPublicada(idEleccion);

    const candidateIds = [
      ...new Set(
        oferta.listas.flatMap((lista) =>
          (lista.candidatos ?? []).map((candidato) => candidato.idCandidato),
        ),
      ),
    ];

    const votesByCandidate = new Map<number, number>();
    await Promise.all(
      candidateIds.map(async (candidateId) => {
        const votes = await this.blockchainService.getVotesByCandidate(
          idEleccion,
          candidateId,
        );
        votesByCandidate.set(candidateId, votes);
      }),
    );

    return oferta.categorias.map((categoria) => ({
      idCategoria: categoria.idCategoria,
      nombreCategoria: categoria.nombre,
      listas: oferta.listas.map((lista) => {
        const votos = (lista.candidatos ?? [])
          .filter(
            (candidato) => candidato.idCategoria === categoria.idCategoria,
          )
          .reduce(
            (sum, candidato) =>
              sum + (votesByCandidate.get(candidato.idCandidato) ?? 0),
            0,
          );
        return {
          idLista: lista.idLista,
          nombreLista: lista.nombre,
          votos,
        };
      }),
      votosEnBlancoGlobales: blankVotes,
      votosNulosGlobales: nullVotes,
    }));
  }
}

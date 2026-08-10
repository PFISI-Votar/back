import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { ParticipacionPublicaResponseDto } from '@/dashboard-publico/dto/participacion-publica-response.dto';
import { ParticipacionSnapshot } from '@/dashboard-publico/entities/participacion-snapshot.entity';
import { SerieTemporalPuntoDto } from '@/dashboard-publico/dto/serie-temporal.dto';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { OfertaElectoralQueryService } from '@/eleccion/lista/services/oferta-electoral-query.service';
import { PadronService } from '@/padron/padron.service';

const ESTADOS_ELECCION_CERRADOS = [
  EleccionEstado.CERRADA,
  EleccionEstado.ESCRUTADA,
];

/**
 * VOTAR-433: fuente de datos actualizada.
 * La serie temporal ya no proviene de eth_getLogs sino de participacion_snapshot.
 */
const FUENTE_DATOS =
  'AuditViewContract.getParticipationStats + participacion_snapshot (DB)';

@Injectable()
export class ParticipacionPublicService {
  constructor(
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    @InjectRepository(ConfiguracionComicio)
    private readonly configuracionRepository: Repository<ConfiguracionComicio>,
    @InjectRepository(ParticipacionSnapshot)
    private readonly snapshotRepository: Repository<ParticipacionSnapshot>,
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
      this.buildSerieTemporal(idEleccion, horasVentana, eleccion.fechaFin), // ← ya no usa eth_getLogs
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
      permitirVotoNulo: configuracion.permitirVotoNulo,
    };
  }

  /**
   * VOTAR-433: construye la serie temporal leyendo participacion_snapshot de la DB.
   *
   * Las muestras crudas (una cada 5 minutos) se agrupan en buckets horarios.
   * Dentro de cada bucket se toma el valor máximo de total_votos como representativo
   * del acumulado al final de esa hora. Los "nuevos" se calculan como la diferencia
   * con el bucket anterior, nunca se persisten.
   *
   * Si la votación dura menos de una hora, todos los votos caen en un único bucket,
   * lo cual es correcto: en comicios breves no tiene sentido analizar afluencia horaria.
   */
  private async buildSerieTemporal(
    idEleccion: number,
    horasVentana: number,
    fechaFin?: Date,
  ): Promise<SerieTemporalPuntoDto[]> {
    const hours = Math.max(1, Math.min(72, Math.floor(horasVentana)));

    // VOTAR-433: anclar la ventana al cierre del comicio si ya terminó,
    // así un comicio cerrado consultado horas/días después sigue mostrando su serie.
    const ancla = fechaFin && fechaFin < new Date() ? fechaFin : new Date();
    const ventanaInicio = new Date(ancla.getTime() - hours * 60 * 60 * 1_000);

    const snapshots = await this.snapshotRepository
      .createQueryBuilder('s')
      .where('s.idEleccion = :idEleccion', { idEleccion })
      .andWhere('s.tomadoEn >= :ventanaInicio', { ventanaInicio })
      .orderBy('s.tomadoEn', 'ASC')
      .getMany();

    if (snapshots.length === 0) {
      return [];
    }

    const buckets = Array.from({ length: hours }, (_, i) => {
      const startMs = ventanaInicio.getTime() + i * 60 * 60 * 1_000;
      return { startMs, maxAcumulado: 0 };
    });

    for (const snapshot of snapshots) {
      const offsetMs = snapshot.tomadoEn.getTime() - ventanaInicio.getTime();
      const bucketIndex = Math.min(
        hours - 1,
        Math.floor(offsetMs / (60 * 60 * 1_000)),
      );
      buckets[bucketIndex].maxAcumulado = Math.max(
        buckets[bucketIndex].maxAcumulado,
        snapshot.totalVotos,
      );
    }

    let acumuladoAnterior = 0;
    let primerBucketConVotos = false;
    const puntos: SerieTemporalPuntoDto[] = [];

    for (const bucket of buckets) {
      if (!primerBucketConVotos && bucket.maxAcumulado === 0) {
        continue;
      }
      primerBucketConVotos = true;

      // Propagar el último acumulado conocido hacia adelante
      // en lugar de emitir 0, y descartar buckets finales que no aportaron
      // nuevos votos y están más allá del último snapshot.
      const acumulado = Math.max(bucket.maxAcumulado, acumuladoAnterior);
      const nuevos = Math.max(0, acumulado - acumuladoAnterior);

      const etiqueta = new Date(bucket.startMs).toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'America/Argentina/Buenos_Aires',
      });

      puntos.push({ etiqueta, acumulado, nuevos });
      acumuladoAnterior = acumulado;
    }

    // Descartar buckets finales vacíos (posteriores al último snapshot con votos)
    while (
      puntos.length > 1 &&
      puntos.at(-1)!.nuevos === 0 &&
      puntos.at(-1)!.acumulado === puntos.at(-2)!.acumulado
    ) {
      puntos.pop();
    }

    return puntos;
  }

  // buildDesglosePorCategoria queda exactamente igual que antes
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

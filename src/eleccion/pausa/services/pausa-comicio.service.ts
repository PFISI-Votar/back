import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { EleccionGateway } from '@/eleccion/gateways/eleccion.gateway';
import { SolicitudPausa } from '@/eleccion/pausa/entities/solicitud-pausa.entity';
import { ConfirmacionPausa } from '@/eleccion/pausa/entities/confirmacion-pausa.entity';
import { SolicitudPausaTipo } from '@/eleccion/pausa/enums/solicitud-pausa-tipo.enum';
import { SolicitudPausaEstado } from '@/eleccion/pausa/enums/solicitud-pausa-estado.enum';
import { EstadoSolicitudPausaResponseDto } from '@/eleccion/pausa/dto/estado-solicitud-pausa-response.dto';
import { BlockchainService } from '@/blockchain/blockchain.service';
import { AuditLoggerService } from '@/audit/audit-logger.service';

/**
 * VOTAR-347 — orquesta la pausa/reanudación de emergencia de un comicio.
 *
 * El AC2 ("PAUSER_ROLE no debe asignarse a una única cuenta") se aplica acá,
 * no en el contrato: `PAUSER_ROLE` on-chain queda en la wallet operativa
 * única del backend (`ElectionFactory.pauserOperator`), pero esta capa exige
 * que `PAUSE_CONFIRMATIONS_REQUIRED` (default 2) autoridades PAUSER
 * *distintas* confirmen la misma solicitud antes de emitir la transacción.
 */
@Injectable()
export class PausaComicioService {
  private readonly logger = new Logger(PausaComicioService.name);

  /** Evita que dos confirmaciones concurrentes para el mismo comicio compitan
   *  por la misma wallet on-chain (mismo motivo que ElectionStateService). */
  private readonly solicitudesEnCurso = new Set<number>();

  constructor(
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    @InjectRepository(SolicitudPausa)
    private readonly solicitudRepository: Repository<SolicitudPausa>,
    @InjectRepository(ConfirmacionPausa)
    private readonly confirmacionRepository: Repository<ConfirmacionPausa>,
    private readonly blockchainService: BlockchainService,
    private readonly auditLoggerService: AuditLoggerService,
    private readonly eleccionGateway: EleccionGateway,
    private readonly configService: ConfigService,
  ) {}

  async solicitarPausa(
    idEleccion: number,
    actorId: string,
    razon: string,
    ipOrigen?: string,
  ): Promise<EstadoSolicitudPausaResponseDto> {
    return this.procesarSolicitud(
      idEleccion,
      SolicitudPausaTipo.PAUSAR,
      actorId,
      razon,
      ipOrigen,
    );
  }

  async solicitarReanudacion(
    idEleccion: number,
    actorId: string,
    razon: string,
    ipOrigen?: string,
  ): Promise<EstadoSolicitudPausaResponseDto> {
    return this.procesarSolicitud(
      idEleccion,
      SolicitudPausaTipo.REANUDAR,
      actorId,
      razon,
      ipOrigen,
    );
  }

  /** Estado del pedido PENDIENTE actual (si hay uno) para un comicio. */
  async obtenerEstadoPendiente(
    idEleccion: number,
  ): Promise<EstadoSolicitudPausaResponseDto | null> {
    const pendiente = await this.solicitudRepository.findOne({
      where: { idEleccion, estado: SolicitudPausaEstado.PENDIENTE },
    });
    if (!pendiente) {
      return null;
    }
    const confirmaciones = await this.confirmacionRepository.count({
      where: { idSolicitud: pendiente.idSolicitud },
    });
    return {
      tipo: pendiente.tipo,
      confirmaciones,
      requeridas: this.umbralConfirmaciones(),
      ejecutada: false,
      razon: pendiente.razon,
    };
  }

  private umbralConfirmaciones(): number {
    return Number(
      this.configService.get<string | number>('PAUSE_CONFIRMATIONS_REQUIRED') ??
        2,
    );
  }

  private async procesarSolicitud(
    idEleccion: number,
    tipo: SolicitudPausaTipo,
    actorId: string,
    razon: string | null,
    ipOrigen?: string,
  ): Promise<EstadoSolicitudPausaResponseDto> {
    if (this.solicitudesEnCurso.has(idEleccion)) {
      throw new ConflictException(
        `Ya hay una operación de pausa en curso para la elección ${idEleccion}. Reintentá en unos segundos.`,
      );
    }
    this.solicitudesEnCurso.add(idEleccion);
    try {
      const eleccion = await this.eleccionRepository.findOne({
        where: { idEleccion },
      });
      if (!eleccion) {
        throw new NotFoundException(`Elección ${idEleccion} no encontrada`);
      }

      if (tipo === SolicitudPausaTipo.PAUSAR) {
        if (eleccion.estado !== EleccionEstado.ABIERTA) {
          throw new UnprocessableEntityException(
            `El comicio debe estar en estado ABIERTA para pausarse. Estado actual: ${eleccion.estado}`,
          );
        }
        if (eleccion.pausada) {
          throw new UnprocessableEntityException(
            `El comicio ${idEleccion} ya está pausado.`,
          );
        }
      } else if (!eleccion.pausada) {
        throw new UnprocessableEntityException(
          `El comicio ${idEleccion} no está pausado.`,
        );
      }

      const actorHash = this.auditLoggerService.ofuscarOperador(actorId);

      let solicitud = await this.solicitudRepository.findOne({
        where: { idEleccion, tipo, estado: SolicitudPausaEstado.PENDIENTE },
      });
      if (!solicitud) {
        solicitud = await this.solicitudRepository.save(
          this.solicitudRepository.create({
            idEleccion,
            tipo,
            razon,
            creadoPorHash: actorHash,
          }),
        );
      } else {
        // La solicitud ya existía: si el umbral ya se había alcanzado en un
        // intento previo pero la ejecución on-chain falló (RPC caído, gas,
        // etc.), la dejamos auto-recuperable — cualquier PAUSER que confirme
        // de nuevo simplemente reintenta la transacción, sin exigir una
        // confirmación nueva (ya se aprobó; esto es un reintento, no un voto).
        const confirmacionesExistentes =
          await this.confirmacionRepository.count({
            where: { idSolicitud: solicitud.idSolicitud },
          });
        const requeridas = this.umbralConfirmaciones();
        if (confirmacionesExistentes >= requeridas) {
          this.logger.log(
            `Solicitud de ${tipo} para comicio ${idEleccion} ya había alcanzado el umbral; reintentando ejecución on-chain.`,
          );
          return this.ejecutar(
            eleccion,
            solicitud,
            tipo,
            actorId,
            confirmacionesExistentes,
            requeridas,
            ipOrigen,
          );
        }
      }

      const yaConfirmo = await this.confirmacionRepository.findOne({
        where: { idSolicitud: solicitud.idSolicitud, actorHash },
      });
      if (yaConfirmo) {
        throw new ConflictException(
          'Esta autoridad ya confirmó esta solicitud. Se necesita una autoridad PAUSER distinta.',
        );
      }

      await this.confirmacionRepository.save(
        this.confirmacionRepository.create({
          idSolicitud: solicitud.idSolicitud,
          actorHash,
        }),
      );

      const confirmaciones = await this.confirmacionRepository.count({
        where: { idSolicitud: solicitud.idSolicitud },
      });
      const requeridas = this.umbralConfirmaciones();

      if (confirmaciones < requeridas) {
        this.logger.log(
          `Solicitud de ${tipo} para comicio ${idEleccion}: ${confirmaciones}/${requeridas} confirmaciones.`,
        );
        return {
          tipo,
          confirmaciones,
          requeridas,
          ejecutada: false,
          razon: solicitud.razon,
        };
      }

      return this.ejecutar(
        eleccion,
        solicitud,
        tipo,
        actorId,
        confirmaciones,
        requeridas,
        ipOrigen,
      );
    } finally {
      this.solicitudesEnCurso.delete(idEleccion);
    }
  }

  private async ejecutar(
    eleccion: Eleccion,
    solicitud: SolicitudPausa,
    tipo: SolicitudPausaTipo,
    actorId: string,
    confirmaciones: number,
    requeridas: number,
    ipOrigen?: string,
  ): Promise<EstadoSolicitudPausaResponseDto> {
    const now = new Date();

    if (tipo === SolicitudPausaTipo.PAUSAR) {
      const resultado = await this.blockchainService.pauseElection(
        eleccion.idEleccion,
        solicitud.razon ?? '',
      );
      solicitud.txHashBallot = resultado.ballotTxHash || null;
      solicitud.txHashVoteRegistry = resultado.voteRegistryTxHash || null;
      eleccion.pausada = true;
      eleccion.pausadaEn = now;

      await this.auditLoggerService.logComicioPausado({
        idEleccion: eleccion.idEleccion,
        actorId,
        razon: solicitud.razon ?? '',
        confirmaciones,
        txHashBallot: solicitud.txHashBallot,
        txHashVoteRegistry: solicitud.txHashVoteRegistry,
        timestamp: now,
        ipOrigen,
      });
      this.eleccionGateway.emitEleccionPausada(
        eleccion.idEleccion,
        solicitud.razon ?? '',
      );
    } else {
      const resultado = await this.blockchainService.unpauseElection(
        eleccion.idEleccion,
      );
      solicitud.txHashBallot = resultado.ballotTxHash || null;
      solicitud.txHashVoteRegistry = resultado.voteRegistryTxHash || null;
      eleccion.pausada = false;
      eleccion.pausadaEn = null;

      await this.auditLoggerService.logComicioReanudado({
        idEleccion: eleccion.idEleccion,
        actorId,
        razon: solicitud.razon ?? '',
        confirmaciones,
        txHashBallot: solicitud.txHashBallot,
        txHashVoteRegistry: solicitud.txHashVoteRegistry,
        timestamp: now,
        ipOrigen,
      });
      this.eleccionGateway.emitEleccionReanudada(eleccion.idEleccion);
    }

    solicitud.estado = SolicitudPausaEstado.EJECUTADA;
    solicitud.ejecutadoEn = now;
    await this.solicitudRepository.save(solicitud);
    await this.eleccionRepository.save(eleccion);

    this.logger.log(
      `Comicio ${eleccion.idEleccion} — ${tipo} ejecutada on-chain tras ${confirmaciones} confirmaciones.`,
    );

    return {
      tipo,
      confirmaciones,
      requeridas,
      ejecutada: true,
      razon: solicitud.razon,
      txHashBallot: solicitud.txHashBallot,
      txHashVoteRegistry: solicitud.txHashVoteRegistry,
    };
  }
}

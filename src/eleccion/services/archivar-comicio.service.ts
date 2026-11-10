import { Injectable, Logger } from '@nestjs/common';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import { EleccionGateway } from '@/eleccion/gateways/eleccion.gateway';
import { ElectionStateService } from '@/eleccion/services/election-state.service';

/**
 * Orquestación del archivado manual del comicio (VOTAR-322).
 * Operación estrictamente off-chain: no sincroniza ni escribe en Sepolia.
 */
@Injectable()
export class ArchivarComicioService {
  private readonly logger = new Logger(ArchivarComicioService.name);

  constructor(
    private readonly electionStateService: ElectionStateService,
    private readonly auditLoggerService: AuditLoggerService,
    private readonly eleccionGateway: EleccionGateway,
  ) {}

  async archivarManual(
    idEleccion: number,
    actorId: string,
    ipOrigen?: string,
  ): Promise<Eleccion> {
    const now = new Date();

    const eleccionArchivada =
      await this.electionStateService.transitionToArchivada(idEleccion);

    await this.auditLoggerService.logComicioArchivado({
      idEleccion,
      actorId,
      timestamp: now,
      ipOrigen,
    });

    this.eleccionGateway.emitEleccionArchivada(eleccionArchivada.idEleccion);

    this.logger.log(
      `Comicio ${idEleccion} ("${eleccionArchivada.nombre}") archivado por ${actorId}`,
    );

    return eleccionArchivada;
  }
}

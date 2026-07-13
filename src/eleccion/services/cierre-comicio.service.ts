import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Eleccion } from '../entities/eleccion.entity';
import { EleccionEstado } from '../enums/eleccion-estado.enum';
import { CerrarEleccionResponseDto } from '../dto/cerrar-eleccion-response.dto';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import { EleccionGateway } from '@/eleccion/gateways/eleccion.gateway';
import { ElectionStateService } from '@/eleccion/services/election-state.service';

/**
 * Orquestación del cierre manual/automático del comicio (VOTAR-321).
 * Sincroniza estado CLOSED on-chain, congela el dashboard (snapshot) y notifica clientes.
 */
@Injectable()
export class CierreComicioService {
  private readonly logger = new Logger(CierreComicioService.name);

  constructor(
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    @InjectRepository(ConfiguracionComicio)
    private readonly configuracionRepository: Repository<ConfiguracionComicio>,
    private readonly auditLoggerService: AuditLoggerService,
    private readonly eleccionGateway: EleccionGateway,
    private readonly electionStateService: ElectionStateService,
  ) {}

  async cerrarManual(
    idEleccion: number,
    actorId: string,
    ipOrigen?: string,
  ): Promise<CerrarEleccionResponseDto> {
    return this.cerrar(idEleccion, 'MANUAL', actorId, ipOrigen);
  }

  async cerrarAutomatico(
    idEleccion: number,
  ): Promise<CerrarEleccionResponseDto> {
    return this.cerrar(idEleccion, 'AUTOMATICO', 'SYSTEM');
  }

  private async cerrar(
    idEleccion: number,
    modo: 'MANUAL' | 'AUTOMATICO',
    actorId: string,
    ipOrigen?: string,
  ): Promise<CerrarEleccionResponseDto> {
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });

    if (!eleccion) {
      throw new NotFoundException(`Elección ${idEleccion} no encontrada`);
    }

    if (eleccion.estado !== EleccionEstado.ABIERTA) {
      throw new UnprocessableEntityException(
        `El comicio debe estar en estado ABIERTA para cerrarse. Estado actual: ${eleccion.estado}`,
      );
    }

    const now = new Date();

    const eleccionCerrada =
      await this.electionStateService.transitionToCerrada(idEleccion);

    await this.congelarSnapshotDashboard(idEleccion);

    await this.auditLoggerService.logComicioCerrado({
      idEleccion,
      actorId,
      modo,
      timestamp: now,
      ipOrigen,
    });

    this.eleccionGateway.emitEleccionCerrada(eleccionCerrada.idEleccion);

    this.logger.log(
      `Comicio ${idEleccion} ("${eleccionCerrada.nombre}") cerrado (${modo}) por ${actorId}`,
    );

    return {
      idEleccion,
      estado: EleccionEstado.CERRADA,
      fechaCierre: now,
      modo,
      snapshotCongelado: true,
    };
  }

  /**
   * Congela actualizaciones dinámicas del Portal de Transparencia (AC snapshot).
   */
  private async congelarSnapshotDashboard(idEleccion: number): Promise<void> {
    const config = await this.configuracionRepository.findOne({
      where: { idEleccion },
    });
    if (!config) {
      return;
    }
    config.mostrarResultadosTiempoReal = false;
    await this.configuracionRepository.save(config);
  }
}

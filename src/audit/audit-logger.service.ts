import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import { AuditLog } from '@/audit/entities/audit-log.entity';
import { TipoEventoAudit } from '@/audit/enums/tipo-evento-audit.enum';

export interface LogAccesoDenegadoInput {
  actorId: string;
  ipOrigen: string;
  endpoint: string;
  timestamp: Date;
  datosAdicionales?: Record<string, unknown>;
}

export interface LogVotoEmitidoInput {
  idEleccion: number;
  timestamp?: Date;
  /** Ruta HTTP o etiqueta de origen; nunca debe incluir identidad. */
  endpoint?: string;
}

export interface LogComicioAbiertoInput {
  idEleccion: number;
  actorId: string;
  modo: 'MANUAL' | 'AUTOMATICO';
  timestamp: Date;
  ipOrigen?: string;
}

export interface LogComicioCerradoInput {
  idEleccion: number;
  actorId: string;
  modo: 'MANUAL' | 'AUTOMATICO';
  timestamp: Date;
  ipOrigen?: string;
}

/** Campos que permitirían cruzar un evento de voto con logs de SSO (VOTAR-379 UAT-05). */
const FORBIDDEN_VOTO_JOIN_KEYS = [
  'ip',
  'ipOrigen',
  'ip_origen',
  'ipAddress',
  'IP_Address',
  'userAgent',
  'user_agent',
  'User-Agent',
  'sessionId',
  'SessionID',
  'session_id',
  'votanteHash',
  'votante_hash',
  'voterId',
  'voter_id',
  'sub',
  'email',
] as const;

@Injectable()
export class AuditLoggerService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async logAccesoDenegado(input: LogAccesoDenegadoInput): Promise<void> {
    const descripcion = `Intento de acceso no autorizado a ${input.endpoint}`;
    const hashRegistro = createHash('sha256')
      .update(
        `${input.actorId}|${input.endpoint}|${input.timestamp.toISOString()}|${input.ipOrigen}`,
      )
      .digest('hex');
    const entry = this.auditLogRepository.create({
      idEleccion: null,
      tipoEvento: TipoEventoAudit.ACCESO_DENEGADO,
      actor: input.actorId,
      descripcion,
      hashRegistro,
      ipOrigen: input.ipOrigen,
      endpoint: input.endpoint,
      datosAdicionales: input.datosAdicionales ?? null,
    });
    await this.auditLogRepository.save(entry);
  }

  /**
   * Registra un sufragio de forma anónima (VOTAR-379).
   * Solo persiste idEleccion + tipo de evento; nunca IP, UA, session ni identidad.
   */
  async logVotoEmitido(input: LogVotoEmitidoInput): Promise<AuditLog> {
    const timestamp = input.timestamp ?? new Date();
    const hashRegistro = createHash('sha256')
      .update(
        `${TipoEventoAudit.VOTO_EMITIDO}|${input.idEleccion}|${timestamp.toISOString()}`,
      )
      .digest('hex');
    const entry = this.auditLogRepository.create({
      idEleccion: input.idEleccion,
      tipoEvento: TipoEventoAudit.VOTO_EMITIDO,
      actor: 'ANONIMO',
      descripcion: 'Voto emitido (registro anónimo off-chain)',
      hashRegistro,
      ipOrigen: null,
      endpoint: input.endpoint ?? 'voto/emitido-anonimo',
      datosAdicionales: null,
    });
    this.assertVotoAuditIsAnonymous(entry);
    return this.auditLogRepository.save(entry);
  }

  /**
   * Invariante UAT-05: un registro de voto no puede cargar claves joinables con SSO.
   */
  assertVotoAuditIsAnonymous(entry: Partial<AuditLog>): void {
    if (entry.tipoEvento !== TipoEventoAudit.VOTO_EMITIDO) {
      return;
    }
    if (entry.ipOrigen != null && entry.ipOrigen !== '') {
      throw new Error(
        'VOTAR-379: evento VOTO_EMITIDO no puede incluir ip_origen',
      );
    }
    if (entry.actor && entry.actor !== 'ANONIMO') {
      throw new Error(
        'VOTAR-379: evento VOTO_EMITIDO no puede incluir actor SSO',
      );
    }
    const extra = entry.datosAdicionales ?? {};
    for (const key of FORBIDDEN_VOTO_JOIN_KEYS) {
      if (Object.prototype.hasOwnProperty.call(extra, key)) {
        throw new Error(
          `VOTAR-379: evento VOTO_EMITIDO no puede incluir campo joinable "${key}"`,
        );
      }
    }
  }

  async logComicioAbierto(input: LogComicioAbiertoInput): Promise<void> {
    const descripcion =
      input.modo === 'MANUAL'
        ? `Apertura manual del comicio por ${input.actorId}`
        : `Apertura automática del comicio por timestamp`;

    const hashRegistro = createHash('sha256')
      .update(
        `${input.idEleccion}|${input.actorId}|${input.modo}|${input.timestamp.toISOString()}`,
      )
      .digest('hex');

    const entry = this.auditLogRepository.create({
      idEleccion: input.idEleccion,
      tipoEvento: TipoEventoAudit.COMICIO_ABIERTO,
      actor: input.actorId,
      descripcion,
      hashRegistro,
      ipOrigen: input.ipOrigen ?? 'SYSTEM',
      endpoint: input.modo === 'MANUAL' ? '/elecciones/:id/abrir' : 'SCHEDULER',
      datosAdicionales: { modo: input.modo },
    });

    await this.auditLogRepository.save(entry);
  }

  async logComicioCerrado(input: LogComicioCerradoInput): Promise<void> {
    const descripcion =
      input.modo === 'MANUAL'
        ? `Cierre manual del comicio por ${input.actorId}`
        : `Cierre automático del comicio por timestamp`;

    const hashRegistro = createHash('sha256')
      .update(
        `${TipoEventoAudit.COMICIO_CERRADO}|${input.idEleccion}|${input.actorId}|${input.modo}|${input.timestamp.toISOString()}`,
      )
      .digest('hex');

    const entry = this.auditLogRepository.create({
      idEleccion: input.idEleccion,
      tipoEvento: TipoEventoAudit.COMICIO_CERRADO,
      actor: input.actorId,
      descripcion,
      hashRegistro,
      ipOrigen: input.ipOrigen ?? 'SYSTEM',
      endpoint:
        input.modo === 'MANUAL' ? '/elecciones/:id/cerrar' : 'SCHEDULER',
      datosAdicionales: { modo: input.modo, snapshotCongelado: true },
    });

    await this.auditLogRepository.save(entry);
  }
}

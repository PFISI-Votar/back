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

export interface LogComicioAbiertoInput {
  idEleccion: number;
  actorId: string;
  modo: 'MANUAL' | 'AUTOMATICO';
  timestamp: Date;
  ipOrigen?: string;
}

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
}

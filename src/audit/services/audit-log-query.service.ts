import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import { AuditLogSearchQueryDto } from '@/audit/dto/audit-log-search-query.dto';
import { AuditLogItemResponseDto } from '@/audit/dto/audit-log-item-response.dto';
import { AuditLogListResponseDto } from '@/audit/dto/audit-log-list-response.dto';
import { AuditLog } from '@/audit/entities/audit-log.entity';

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;
const IPV4_PATTERN = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)(?:\.(?!$)|$)){4}$/;

@Injectable()
export class AuditLogQueryService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    private readonly auditLoggerService: AuditLoggerService,
  ) {}

  /**
   * Consulta paginada del registro de auditoría institucional con filtros avanzados.
   */
  async consultarAuditLog(
    query: AuditLogSearchQueryDto,
  ): Promise<AuditLogListResponseDto> {
    this.assertRangoTemporalValido(query.desde, query.hasta);
    const qb = this.auditLogRepository.createQueryBuilder('log');
    this.applyFilters(qb, query);
    qb.orderBy('log.timestamp', 'DESC').addOrderBy('log.idLog', 'DESC');
    qb.skip((query.page - 1) * query.limit).take(query.limit);
    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map((row) => this.toItemDto(row)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  private assertRangoTemporalValido(desde?: string, hasta?: string): void {
    if (!desde || !hasta) {
      return;
    }
    const desdeDate = new Date(desde);
    const hastaDate = new Date(hasta);
    if (desdeDate.getTime() > hastaDate.getTime()) {
      throw new UnprocessableEntityException(
        'El parámetro "desde" no puede ser posterior a "hasta".',
      );
    }
  }

  private applyFilters(
    qb: SelectQueryBuilder<AuditLog>,
    query: AuditLogSearchQueryDto,
  ): void {
    if (query.idEleccion != null) {
      qb.andWhere('log.idEleccion = :idEleccion', {
        idEleccion: query.idEleccion,
      });
    }
    if (query.tipoEvento != null && query.tipoEvento.length > 0) {
      qb.andWhere('log.tipoEvento IN (:...tipoEvento)', {
        tipoEvento: query.tipoEvento,
      });
    }
    if (query.actor != null && query.actor.length > 0) {
      const actorHash = this.resolveActorFilter(query.actor);
      qb.andWhere('log.actor = :actor', { actor: actorHash });
    }
    if (query.terminal != null && query.terminal.length > 0) {
      const terminalHash = this.resolveTerminalFilter(query.terminal);
      qb.andWhere('log.ipOrigen = :terminal', { terminal: terminalHash });
    }
    if (query.endpoint != null && query.endpoint.length > 0) {
      qb.andWhere('log.endpoint ILIKE :endpoint', {
        endpoint: `%${this.escapeIlike(query.endpoint)}%`,
      });
    }
    if (query.desde != null) {
      qb.andWhere('log.timestamp >= :desde', { desde: query.desde });
    }
    if (query.hasta != null) {
      qb.andWhere('log.timestamp <= :hasta', { hasta: query.hasta });
    }
    if (query.nivel != null) {
      qb.andWhere("log.datos_adicionales->>'nivel' = :nivel", {
        nivel: query.nivel,
      });
    }
    if (query.resultado != null) {
      qb.andWhere("log.datos_adicionales->>'resultado' = :resultado", {
        resultado: query.resultado,
      });
    }
    if (query.q != null && query.q.length > 0) {
      qb.andWhere(
        new Brackets((sub) => {
          sub.where('log.descripcion ILIKE :q', {
            q: `%${this.escapeIlike(query.q!)}%`,
          });
        }),
      );
    }
  }

  private resolveActorFilter(actor: string): string {
    if (SHA256_HEX_PATTERN.test(actor)) {
      return actor.toLowerCase();
    }
    return this.auditLoggerService.ofuscarOperador(actor);
  }

  private resolveTerminalFilter(terminal: string): string {
    if (SHA256_HEX_PATTERN.test(terminal)) {
      return terminal.toLowerCase();
    }
    if (IPV4_PATTERN.test(terminal) || terminal.includes(':')) {
      return this.auditLoggerService.identificadorTerminal(terminal);
    }
    return this.auditLoggerService.identificadorTerminal(terminal);
  }

  private escapeIlike(value: string): string {
    return value.replace(/[%_\\]/g, '\\$&');
  }

  private toItemDto(row: AuditLog): AuditLogItemResponseDto {
    return {
      idLog: row.idLog,
      idEleccion: row.idEleccion,
      tipoEvento: row.tipoEvento,
      timestamp: row.timestamp,
      actor: row.actor,
      descripcion: row.descripcion,
      endpoint: row.endpoint,
      identificadorTerminal: row.ipOrigen,
      datosAdicionales: row.datosAdicionales,
      hashRegistro: row.hashRegistro,
      hashAnterior: row.hashAnterior,
    };
  }
}

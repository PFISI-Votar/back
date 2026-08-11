import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { EntityManager, Repository } from 'typeorm';
import { AuditLog } from '@/audit/entities/audit-log.entity';
import { TipoEventoAudit } from '@/audit/enums/tipo-evento-audit.enum';

/** Hash génesis cuando aún no hay entradas previas en la cadena. */
export const AUDIT_GENESIS_HASH = '0'.repeat(64);

/**
 * Clave de advisory lock (transaction-scoped) para serializar writers
 * concurrentes de la cadena de auditoría (VOTAR-370).
 */
export const AUDIT_CHAIN_ADVISORY_LOCK_KEY = 370_000_001;

const ACTORS_SIN_OFUSCAR = new Set(['SYSTEM', 'ANONIMO', 'anonymous']);

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

export interface LogComicioArchivadoInput {
  idEleccion: number;
  actorId: string;
  timestamp: Date;
  ipOrigen?: string;
}

export interface LogLoginInput {
  actorId: string;
  timestamp?: Date;
  ipOrigen?: string;
  role?: string;
}

export interface LogPadronCargadoInput {
  idEleccion: number;
  actorId: string;
  nombreArchivo: string;
  totalProcesados: number;
  totalImportados: number;
  duplicadosExcluidos: number;
  merkleRoot: string;
  timestamp?: Date;
  ipOrigen?: string;
}

export interface LogPadronCargaFallidaInput {
  idEleccion: number;
  actorId: string;
  nombreArchivo: string;
  razon: string;
  timestamp?: Date;
  ipOrigen?: string;
}

export interface LogConfigModificadaInput {
  idEleccion: number;
  actorId: string;
  cambios: Record<string, unknown>;
  timestamp?: Date;
  ipOrigen?: string;
}

interface AppendAuditEntryInput {
  idEleccion: number | null;
  tipoEvento: TipoEventoAudit;
  actorId: string;
  descripcion: string;
  endpoint: string;
  ipOrigenRaw?: string | null;
  datosAdicionales?: Record<string, unknown> | null;
  timestamp?: Date;
  /** Si true, no ofusca el actor (p. ej. VOTO_EMITIDO → ANONIMO). */
  preservarActorLiteral?: boolean;
  /** Si true, no persiste identificador de terminal (VOTAR-379). */
  omitirTerminal?: boolean;
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

  /**
   * Ofusca el identificador del operador (UUID/Hash) para el log institucional.
   * SYSTEM / ANONIMO se preservan literales.
   */
  ofuscarOperador(actorId: string): string {
    if (ACTORS_SIN_OFUSCAR.has(actorId)) {
      return actorId;
    }
    return createHash('sha256')
      .update(`${this.getObfuscationSalt()}|actor|${actorId}`)
      .digest('hex');
  }

  /**
   * Identificador de terminal criptográfico: hash de la IP (nunca IP en claro
   * en capas de visualización / descripción pública).
   */
  identificadorTerminal(ipOrigen: string | undefined | null): string {
    const raw = ipOrigen && ipOrigen.length > 0 ? ipOrigen : 'SYSTEM';
    if (raw === 'SYSTEM') {
      return 'SYSTEM';
    }
    return createHash('sha256')
      .update(`${this.getObfuscationSalt()}|terminal|${raw}`)
      .digest('hex');
  }

  async logAccesoDenegado(input: LogAccesoDenegadoInput): Promise<AuditLog> {
    const descripcion = `Intento de acceso no autorizado a ${input.endpoint}`;
    return this.appendEntry({
      idEleccion: null,
      tipoEvento: TipoEventoAudit.ACCESO_DENEGADO,
      actorId: input.actorId,
      descripcion,
      endpoint: input.endpoint,
      ipOrigenRaw: input.ipOrigen,
      datosAdicionales: input.datosAdicionales ?? null,
      timestamp: input.timestamp,
    });
  }

  /**
   * Registra un sufragio de forma anónima (VOTAR-379).
   * Solo persiste idEleccion + tipo de evento; nunca IP, UA, session ni identidad.
   */
  async logVotoEmitido(input: LogVotoEmitidoInput): Promise<AuditLog> {
    const entry = await this.appendEntry({
      idEleccion: input.idEleccion,
      tipoEvento: TipoEventoAudit.VOTO_EMITIDO,
      actorId: 'ANONIMO',
      descripcion: 'Voto emitido (registro anónimo off-chain)',
      endpoint: input.endpoint ?? 'voto/emitido-anonimo',
      ipOrigenRaw: null,
      datosAdicionales: null,
      timestamp: input.timestamp,
      preservarActorLiteral: true,
      omitirTerminal: true,
    });
    this.assertVotoAuditIsAnonymous(entry);
    return entry;
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

  async logComicioAbierto(input: LogComicioAbiertoInput): Promise<AuditLog> {
    const actorOfuscado = this.ofuscarOperador(input.actorId);
    const terminal = this.identificadorTerminal(input.ipOrigen);
    const utc = input.timestamp.toISOString();
    const descripcion =
      input.modo === 'MANUAL'
        ? `Usuario Administrador con ID Ofuscado ${actorOfuscado} inició la apertura del comicio ${input.idEleccion} desde el identificador de terminal criptográfico ${terminal} a la hora UTC ${utc}`
        : `Apertura automática del comicio ${input.idEleccion} por timestamp a la hora UTC ${utc}`;

    return this.appendEntry({
      idEleccion: input.idEleccion,
      tipoEvento: TipoEventoAudit.COMICIO_ABIERTO,
      actorId: input.actorId,
      descripcion,
      endpoint: input.modo === 'MANUAL' ? '/elecciones/:id/abrir' : 'SCHEDULER',
      ipOrigenRaw: input.ipOrigen ?? 'SYSTEM',
      datosAdicionales: {
        modo: input.modo,
        idOperadorOfuscado: actorOfuscado,
        identificadorTerminal: terminal,
        horaUtc: utc,
      },
      timestamp: input.timestamp,
    });
  }

  async logComicioCerrado(input: LogComicioCerradoInput): Promise<AuditLog> {
    const actorOfuscado = this.ofuscarOperador(input.actorId);
    const terminal = this.identificadorTerminal(input.ipOrigen);
    const utc = input.timestamp.toISOString();
    const descripcion =
      input.modo === 'MANUAL'
        ? `Usuario Administrador con ID Ofuscado ${actorOfuscado} cerró el comicio ${input.idEleccion} desde el identificador de terminal criptográfico ${terminal} a la hora UTC ${utc}`
        : `Cierre automático del comicio ${input.idEleccion} por timestamp a la hora UTC ${utc}`;

    return this.appendEntry({
      idEleccion: input.idEleccion,
      tipoEvento: TipoEventoAudit.COMICIO_CERRADO,
      actorId: input.actorId,
      descripcion,
      endpoint:
        input.modo === 'MANUAL' ? '/elecciones/:id/cerrar' : 'SCHEDULER',
      ipOrigenRaw: input.ipOrigen ?? 'SYSTEM',
      datosAdicionales: {
        modo: input.modo,
        snapshotCongelado: true,
        idOperadorOfuscado: actorOfuscado,
        identificadorTerminal: terminal,
        horaUtc: utc,
      },
      timestamp: input.timestamp,
    });
  }

  /** VOTAR-322: archivado off-chain de un comicio CERRADA. */
  async logComicioArchivado(
    input: LogComicioArchivadoInput,
  ): Promise<AuditLog> {
    const actorOfuscado = this.ofuscarOperador(input.actorId);
    const terminal = this.identificadorTerminal(input.ipOrigen);
    const utc = input.timestamp.toISOString();
    const descripcion = `Usuario Administrador con ID Ofuscado ${actorOfuscado} archivó el comicio ${input.idEleccion} desde el identificador de terminal criptográfico ${terminal} a la hora UTC ${utc}`;

    return this.appendEntry({
      idEleccion: input.idEleccion,
      tipoEvento: TipoEventoAudit.COMICIO_ARCHIVADO,
      actorId: input.actorId,
      descripcion,
      endpoint: '/elecciones/:id/archivar',
      ipOrigenRaw: input.ipOrigen ?? 'SYSTEM',
      datosAdicionales: {
        idOperadorOfuscado: actorOfuscado,
        identificadorTerminal: terminal,
        horaUtc: utc,
      },
      timestamp: input.timestamp,
    });
  }

  /** VOTAR-370: login exitoso de autoridad electoral en el Panel. */
  async logLogin(input: LogLoginInput): Promise<AuditLog> {
    const timestamp = input.timestamp ?? new Date();
    const actorOfuscado = this.ofuscarOperador(input.actorId);
    const terminal = this.identificadorTerminal(input.ipOrigen);
    const utc = timestamp.toISOString();
    const descripcion = `Usuario Administrador con ID Ofuscado ${actorOfuscado} inició sesión en el Panel desde el identificador de terminal criptográfico ${terminal} a la hora UTC ${utc}`;

    return this.appendEntry({
      idEleccion: null,
      tipoEvento: TipoEventoAudit.LOGIN,
      actorId: input.actorId,
      descripcion,
      endpoint: 'POST /auth/login',
      ipOrigenRaw: input.ipOrigen,
      datosAdicionales: {
        idOperadorOfuscado: actorOfuscado,
        identificadorTerminal: terminal,
        horaUtc: utc,
        role: input.role ?? null,
      },
      timestamp,
    });
  }

  /** VOTAR-370 UAT-02: carga exitosa de padrón CSV con detalle enriquecido. */
  async logPadronCargado(input: LogPadronCargadoInput): Promise<AuditLog> {
    const timestamp = input.timestamp ?? new Date();
    const actorOfuscado = this.ofuscarOperador(input.actorId);
    const terminal = this.identificadorTerminal(input.ipOrigen);
    const utc = timestamp.toISOString();
    const descripcion =
      `Usuario Administrador con ID Ofuscado ${actorOfuscado} cargó el padrón del comicio ${input.idEleccion} ` +
      `desde el archivo "${input.nombreArchivo}" (${input.totalImportados} filas netas importadas, ` +
      `${input.duplicadosExcluidos} duplicados excluidos, raíz Merkle ${input.merkleRoot}) ` +
      `desde el identificador de terminal criptográfico ${terminal} a la hora UTC ${utc}`;

    return this.appendEntry({
      idEleccion: input.idEleccion,
      tipoEvento: TipoEventoAudit.PADRON_CARGADO,
      actorId: input.actorId,
      descripcion,
      endpoint: '/elecciones/:id/padron/import',
      ipOrigenRaw: input.ipOrigen,
      datosAdicionales: {
        resultado: 'EXITOSO',
        nivel: 'INFO',
        idOperadorOfuscado: actorOfuscado,
        identificadorTerminal: terminal,
        horaUtc: utc,
        nombreArchivo: input.nombreArchivo,
        totalProcesados: input.totalProcesados,
        totalImportados: input.totalImportados,
        duplicadosExcluidos: input.duplicadosExcluidos,
        merkleRoot: input.merkleRoot,
      },
      timestamp,
    });
  }

  /**
   * VOTAR-370 UAT-03: fallo de integridad en carga de padrón.
   * Mantiene la continuidad secuencial de la cadena de auditoría.
   */
  async logPadronCargaFallida(
    input: LogPadronCargaFallidaInput,
  ): Promise<AuditLog> {
    const timestamp = input.timestamp ?? new Date();
    const actorOfuscado = this.ofuscarOperador(input.actorId);
    const terminal = this.identificadorTerminal(input.ipOrigen);
    const utc = timestamp.toISOString();
    const descripcion =
      `Advertencia/Error: fallo de integridad al cargar padrón del comicio ${input.idEleccion}. ` +
      `Operador ofuscado ${actorOfuscado}, archivo "${input.nombreArchivo}", ` +
      `razón del rechazo: ${input.razon}. Terminal criptográfico ${terminal}. Hora UTC ${utc}`;

    return this.appendEntry({
      idEleccion: input.idEleccion,
      tipoEvento: TipoEventoAudit.PADRON_CARGADO,
      actorId: input.actorId,
      descripcion,
      endpoint: '/elecciones/:id/padron/import',
      ipOrigenRaw: input.ipOrigen,
      datosAdicionales: {
        resultado: 'RECHAZADO',
        nivel: 'ERROR',
        idOperadorOfuscado: actorOfuscado,
        identificadorTerminal: terminal,
        horaUtc: utc,
        nombreArchivo: input.nombreArchivo,
        razon: input.razon,
      },
      timestamp,
    });
  }

  /** VOTAR-370: modificación de parámetros críticos de configuración (p. ej. re-voto). */
  async logConfigModificada(
    input: LogConfigModificadaInput,
  ): Promise<AuditLog> {
    const timestamp = input.timestamp ?? new Date();
    const actorOfuscado = this.ofuscarOperador(input.actorId);
    const terminal = this.identificadorTerminal(input.ipOrigen);
    const utc = timestamp.toISOString();
    const descripcion =
      `Usuario Administrador con ID Ofuscado ${actorOfuscado} modificó la configuración del comicio ${input.idEleccion} ` +
      `desde el identificador de terminal criptográfico ${terminal} a la hora UTC ${utc}`;

    return this.appendEntry({
      idEleccion: input.idEleccion,
      tipoEvento: TipoEventoAudit.CONFIG_MODIFICADA,
      actorId: input.actorId,
      descripcion,
      endpoint: '/elecciones/:id/configuracion',
      ipOrigenRaw: input.ipOrigen,
      datosAdicionales: {
        idOperadorOfuscado: actorOfuscado,
        identificadorTerminal: terminal,
        horaUtc: utc,
        cambios: input.cambios,
      },
      timestamp,
    });
  }

  /**
   * Persiste una entrada encadenada: incluye hash del bloque anterior y
   * ofusca actor + terminal. Serializa writers concurrentes con advisory lock
   * (pg_advisory_xact_lock) para preservar secuencialidad estricta del hash.
   */
  private async appendEntry(input: AppendAuditEntryInput): Promise<AuditLog> {
    return this.auditLogRepository.manager.transaction(async (manager) => {
      await this.acquireAuditChainLock(manager);
      const repo = manager.getRepository(AuditLog);
      const anteriores = await repo.find({
        order: { idLog: 'DESC' },
        take: 1,
      });
      const hashAnterior =
        anteriores[0]?.hashRegistro && anteriores[0].hashRegistro.length > 0
          ? anteriores[0].hashRegistro
          : AUDIT_GENESIS_HASH;

      const actor = input.preservarActorLiteral
        ? input.actorId
        : this.ofuscarOperador(input.actorId);
      const terminal = input.omitirTerminal
        ? null
        : this.identificadorTerminal(input.ipOrigenRaw);
      const timestamp = input.timestamp ?? new Date();
      const datosAdicionales = input.datosAdicionales ?? null;

      const hashRegistro = createHash('sha256')
        .update(
          [
            hashAnterior,
            input.tipoEvento,
            input.idEleccion ?? '',
            actor,
            timestamp.toISOString(),
            input.descripcion,
            terminal ?? '',
            input.endpoint,
            JSON.stringify(datosAdicionales),
          ].join('|'),
        )
        .digest('hex');

      const entry = repo.create({
        idEleccion: input.idEleccion,
        tipoEvento: input.tipoEvento,
        actor,
        descripcion: input.descripcion,
        hashAnterior,
        hashRegistro,
        ipOrigen: terminal,
        endpoint: input.endpoint,
        datosAdicionales,
        timestamp,
      });

      return repo.save(entry);
    });
  }

  /**
   * Bloqueo exclusivo por transacción: evita que dos inserts lean el mismo
   * "último" registro y generen el mismo hash_anterior.
   */
  private async acquireAuditChainLock(manager: EntityManager): Promise<void> {
    try {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [
        AUDIT_CHAIN_ADVISORY_LOCK_KEY,
      ]);
    } catch {
      // pg-mem (e2e) no implementa advisory locks; en Postgres de runtime sí.
    }
  }

  private getObfuscationSalt(): string {
    const salt = process.env.AUDIT_OBFUSCATION_SALT;
    if (salt && salt.length > 0) {
      return salt;
    }
    // En producción el salt es obligatorio (ofuscación no predecible).
    if (process.env.DEVELOPMENT === 'false') {
      throw new Error(
        'AUDIT_OBFUSCATION_SALT es obligatorio cuando DEVELOPMENT=false',
      );
    }
    return 'votar-audit-dev-salt';
  }
}

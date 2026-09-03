import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { keccak256 } from 'ethers';
import { DataSource, Repository } from 'typeorm';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import {
  CredencialValidacion,
  EstadoCredencialValidacion,
} from '@/entidad-firmas/entities/credencial-validacion.entity';
import { EmisionCredencial } from '@/entidad-firmas/entities/emision-credencial.entity';
import { PadronEligibilityService } from '@/padron/services/padron-eligibility.service';

const BUCKET_MS = 5 * 60 * 1000;
const DEFAULT_TTL_MS = 15 * 60 * 1000;

/** Redondea hacia abajo al bucket de 5 minutos (k-anonimato temporal, VOTAR-377). */
export function bucket5min(date: Date): Date {
  return new Date(Math.floor(date.getTime() / BUCKET_MS) * BUCKET_MS);
}

@Injectable()
export class CredencialValidacionService {
  constructor(
    @InjectRepository(CredencialValidacion)
    private readonly credencialRepository: Repository<CredencialValidacion>,
    @InjectRepository(EmisionCredencial)
    private readonly emisionRepository: Repository<EmisionCredencial>,
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    @InjectRepository(ConfiguracionComicio)
    private readonly configuracionRepository: Repository<ConfiguracionComicio>,
    private readonly padronEligibilityService: PadronEligibilityService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  /**
   * VOTAR-377 FASE 1 (autenticada) — valida la pertenencia al padrón del votante
   * del JWT y registra el compromiso de una credencial anónima de un solo uso.
   * NO persiste `votante_hash` junto al `commit`: se escriben en dos filas de
   * tablas sin relación entre sí.
   */
  async emitir(
    idEleccion: number,
    votanteHash: string,
    commit: string,
    ipOrigen?: string | null,
  ): Promise<{ expiraEn: Date }> {
    const eleccion = await this.eleccionRepository.findOne({
      where: { idEleccion },
    });
    if (!eleccion) {
      throw new NotFoundException('Comicio no encontrado');
    }
    if (eleccion.estado !== EleccionEstado.ABIERTA) {
      throw new ForbiddenException(
        'El comicio no está ABIERTA: no se pueden emitir credenciales de validación.',
      );
    }

    const habilitado = await this.padronEligibilityService.isVotanteHabilitado(
      idEleccion,
      votanteHash,
    );
    if (!habilitado) {
      throw new ForbiddenException('No te encuentras habilitado en el padrón');
    }

    await this.assertBajoTope(idEleccion, votanteHash);

    const normalizedCommit = commit.toLowerCase();
    const ttlMs =
      this.configService.get<number>('CREDENCIAL_VALIDACION_TTL_MS') ??
      DEFAULT_TTL_MS;
    const expiraEn = bucket5min(new Date(Date.now() + ttlMs));

    // Filas independientes: un fallo del contador NO deja una credencial huérfana
    // vinculable, y el commit nunca comparte transacción con el votante_hash.
    const existente = await this.credencialRepository.findOne({
      where: { commitCredencial: normalizedCommit },
    });
    if (existente) {
      throw new ConflictException('El commit de credencial ya fue registrado.');
    }

    await this.credencialRepository.save(
      this.credencialRepository.create({
        idEleccion,
        commitCredencial: normalizedCommit,
        estado: EstadoCredencialValidacion.EMITIDA,
        expiraEn,
      }),
    );

    // Contador por votante (fila independiente, sin `commit`).
    const emision = await this.emisionRepository.findOne({
      where: { idEleccion, hashHoja: votanteHash },
    });
    if (emision) {
      await this.emisionRepository.update(
        { idEmision: emision.idEmision },
        {
          credencialesEmitidas: emision.credencialesEmitidas + 1,
          ultimaEmisionEn: bucket5min(new Date()),
        },
      );
    } else {
      await this.emisionRepository.insert({
        idEleccion,
        hashHoja: votanteHash,
        credencialesEmitidas: 1,
        ultimaEmisionEn: bucket5min(new Date()),
      });
    }

    await this.auditLogger.logCredencialValidacionEmitida({
      idEleccion,
      actorId: votanteHash,
      ipOrigen: ipOrigen ?? null,
    });

    return { expiraEn };
  }

  /**
   * VOTAR-377 FASE 2 (anónima) — canjea el secreto revelado por el derecho a una
   * firma institucional. UPDATE condicional atómico: un secreto sólo se consume
   * una vez, incluso bajo concurrencia.
   */
  async consumir(idEleccion: number, secreto: string): Promise<void> {
    const commit = keccak256(secreto).toLowerCase();

    const result = await this.dataSource
      .createQueryBuilder()
      .update(CredencialValidacion)
      .set({ estado: EstadoCredencialValidacion.CONSUMIDA })
      .where('commit_credencial = :commit', { commit })
      .andWhere('id_eleccion = :idEleccion', { idEleccion })
      .andWhere('estado = :estado', {
        estado: EstadoCredencialValidacion.EMITIDA,
      })
      .andWhere('expira_en > :now', { now: new Date() })
      .execute();

    if (!result.affected || result.affected === 0) {
      // No distinguir "inexistente" de "vencida" de "ya usada": no dar oráculo.
      throw new GoneException(
        'Credencial de validación inválida, vencida o ya utilizada.',
      );
    }
  }

  private async assertBajoTope(
    idEleccion: number,
    votanteHash: string,
  ): Promise<void> {
    const config = await this.configuracionRepository.findOne({
      where: { idEleccion },
    });
    const maxVotos = config?.maxVotosPorVotante ?? 1;
    // Tope generoso: tolera reintentos / F5. NO es el anti-doble-voto (ese es el
    // nullifier on-chain). El objetivo es sólo frenar un abuso masivo de la fase 1.
    const tope = Math.max(3, maxVotos * 3);

    const emision = await this.emisionRepository.findOne({
      where: { idEleccion, hashHoja: votanteHash },
    });
    if (emision && emision.credencialesEmitidas >= tope) {
      throw new ConflictException(
        'Se alcanzó el máximo de credenciales de validación para este comicio.',
      );
    }
  }
}

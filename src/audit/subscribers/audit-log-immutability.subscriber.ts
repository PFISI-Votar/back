import { EntitySubscriberInterface, EventSubscriber } from 'typeorm';
import { AuditLog } from '@/audit/entities/audit-log.entity';

const APPEND_ONLY_ERROR =
  'VOTAR-372: audit_log es append-only; UPDATE/DELETE prohibidos en capa ORM';

/**
 * Defensa en profundidad (VOTAR-372): complementa triggers PostgreSQL.
 * La inmutabilidad canónica vive en la BD; este subscriber evita mutaciones accidentales vía TypeORM.
 */
@EventSubscriber()
export class AuditLogImmutabilitySubscriber implements EntitySubscriberInterface<AuditLog> {
  listenTo(): typeof AuditLog {
    return AuditLog;
  }

  beforeUpdate(): void {
    throw new Error(APPEND_ONLY_ERROR);
  }

  beforeRemove(): void {
    throw new Error(APPEND_ONLY_ERROR);
  }
}

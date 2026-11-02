import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  decryptField,
  encryptField,
  isEncrypted,
  resolveFieldKey,
} from '@/common/crypto/field-encryption';

/**
 * VOTAR-498 — cifrado AES-256-GCM en reposo de las columnas que hoy guardan
 * secretos/PII en texto plano y no se usan como criterio de búsqueda:
 * `autoridad_electoral.totp_secret`, `autoridad_electoral.nombre`,
 * `refresh_session.email`, `refresh_session.nombre`.
 *
 * `autoridad_electoral.email` queda fuera a propósito: es la clave de
 * búsqueda del login SSO (`AuthService.findOrCreateAutoridad`).
 *
 * Pasos: 1) ampliar el tipo de columna a `text` (el ciphertext en base64
 * excede el `varchar` original), 2) backfill cifrando cada valor no nulo que
 * todavía no tenga el prefijo `enc:v1:` (idempotente — puede re-correrse sin
 * doble-cifrar). Requiere `DB_ENCRYPTION_KEY` configurada (o `DEVELOPMENT=true`,
 * en cuyo caso sin clave el backfill se salta y las columnas quedan en claro
 * hasta que se configure — mismo comportamiento del transformer en runtime).
 */
export class CifradoEnReposoPii1787600000000 implements MigrationInterface {
  name = 'CifradoEnReposoPii1787600000000';

  private readonly targets: Array<{
    table: string;
    column: string;
    idColumn: string;
  }> = [
    {
      table: 'autoridad_electoral',
      column: 'totp_secret',
      idColumn: 'id_autoridad',
    },
    {
      table: 'autoridad_electoral',
      column: 'nombre',
      idColumn: 'id_autoridad',
    },
    { table: 'refresh_session', column: 'email', idColumn: 'id_session' },
    { table: 'refresh_session', column: 'nombre', idColumn: 'id_session' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const { table, column } of this.targets) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE text`,
      );
    }

    const key = resolveFieldKey();
    if (!key) {
      // DEVELOPMENT=true sin DB_ENCRYPTION_KEY: se difiere el backfill: el
      // transformer seguirá en passthrough hasta que se configure la clave.
      return;
    }

    for (const { table, column, idColumn } of this.targets) {
      const rows = (await queryRunner.query(
        `SELECT "${idColumn}" AS id, "${column}" AS value
           FROM "${table}" WHERE "${column}" IS NOT NULL`,
      )) as Array<{ id: number | string; value: string }>;
      for (const row of rows) {
        if (isEncrypted(row.value)) continue;
        const encrypted = encryptField(row.value, key);
        await queryRunner.query(
          `UPDATE "${table}" SET "${column}" = $1 WHERE "${idColumn}" = $2`,
          [encrypted, row.id],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const key = resolveFieldKey();
    if (key) {
      for (const { table, column, idColumn } of this.targets) {
        const rows = (await queryRunner.query(
          `SELECT "${idColumn}" AS id, "${column}" AS value
             FROM "${table}" WHERE "${column}" IS NOT NULL`,
        )) as Array<{ id: number | string; value: string }>;
        for (const row of rows) {
          if (!isEncrypted(row.value)) continue;
          const plain = decryptField(row.value, key);
          await queryRunner.query(
            `UPDATE "${table}" SET "${column}" = $1 WHERE "${idColumn}" = $2`,
            [plain, row.id],
          );
        }
      }
    }

    await queryRunner.query(
      `ALTER TABLE "autoridad_electoral" ALTER COLUMN "totp_secret" TYPE character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "autoridad_electoral" ALTER COLUMN "nombre" TYPE character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_session" ALTER COLUMN "email" TYPE character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_session" ALTER COLUMN "nombre" TYPE character varying`,
    );
  }
}

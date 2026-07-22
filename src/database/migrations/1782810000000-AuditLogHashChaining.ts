import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VOTAR-370: encadenamiento hash secuencial del audit log institucional.
 * Cada entrada referencia la firma criptográfica (hash_registro) del bloque anterior.
 *
 * Nota: `hash_anterior` es nullable y no se hace backfill de filas preexistentes.
 * La cadena institucional arranca desde la primera escritura posterior a esta
 * migración (génesis = AUDIT_GENESIS_HASH cuando no hay hash previo usable).
 */
export class AuditLogHashChaining1782810000000 implements MigrationInterface {
  name = 'AuditLogHashChaining1782810000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audit_log" ADD "hash_anterior" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audit_log" DROP COLUMN "hash_anterior"`,
    );
  }
}

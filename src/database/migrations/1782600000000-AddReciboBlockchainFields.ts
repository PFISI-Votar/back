import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VOTAR-360: Agrega campos de recibo blockchain a voto_confirmacion
 * para generar comprobante criptográfico de participación electoral.
 *
 * Campos agregados:
 * - tx_hash: Hash de transacción blockchain (66 chars con 0x)
 * - block_number: Número de bloque donde se confirmó
 * - tx_timestamp: Timestamp de la transacción
 * - tx_status: Estado de la transacción (PENDIENTE | CONFIRMADA | FALLIDA)
 * - codigo_verificacion_e2e: UUID único para verificación End-to-End
 * - contract_address: Dirección del smart contract
 */
export class AddReciboBlockchainFields1782600000000
  implements MigrationInterface
{
  name = 'AddReciboBlockchainFields1782600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Crear enum para estado de transacción
    await queryRunner.query(
      `CREATE TYPE "public"."voto_confirmacion_tx_status_enum" AS ENUM('PENDIENTE', 'CONFIRMADA', 'FALLIDA')`,
    );

    // Agregar columnas
    await queryRunner.query(
      `ALTER TABLE "voto_confirmacion"
       ADD COLUMN "tx_hash" character varying(66),
       ADD COLUMN "block_number" integer,
       ADD COLUMN "tx_timestamp" TIMESTAMP WITH TIME ZONE,
       ADD COLUMN "tx_status" "public"."voto_confirmacion_tx_status_enum" DEFAULT 'PENDIENTE',
       ADD COLUMN "codigo_verificacion_e2e" uuid NOT NULL DEFAULT uuid_generate_v4(),
       ADD COLUMN "contract_address" character varying(42)`,
    );

    // Crear índice único en codigo_verificacion_e2e para búsquedas rápidas
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_voto_confirmacion_codigo_verificacion_e2e"
       ON "voto_confirmacion" ("codigo_verificacion_e2e")`,
    );

    // Crear índice en tx_hash para verificación
    await queryRunner.query(
      `CREATE INDEX "IDX_voto_confirmacion_tx_hash"
       ON "voto_confirmacion" ("tx_hash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminar índices
    await queryRunner.query(
      `DROP INDEX "public"."IDX_voto_confirmacion_tx_hash"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_voto_confirmacion_codigo_verificacion_e2e"`,
    );

    // Eliminar columnas
    await queryRunner.query(
      `ALTER TABLE "voto_confirmacion"
       DROP COLUMN "contract_address",
       DROP COLUMN "codigo_verificacion_e2e",
       DROP COLUMN "tx_status",
       DROP COLUMN "tx_timestamp",
       DROP COLUMN "block_number",
       DROP COLUMN "tx_hash"`,
    );

    // Eliminar enum
    await queryRunner.query(
      `DROP TYPE "public"."voto_confirmacion_tx_status_enum"`,
    );
  }
}

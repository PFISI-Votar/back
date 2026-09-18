import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VOTAR-497 — clave_intento en relayer_capacidad para cooldown off-chain
 * (VOTAR-325/328). Solo ancla de sesión electoral; no nullifier/selección/tx.
 */
export class RelayerCapacidadClaveIntento1787600000000 implements MigrationInterface {
  name = 'RelayerCapacidadClaveIntento1787600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "relayer_capacidad"
        ADD "clave_intento" character varying(64) NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "relayer_capacidad" DROP COLUMN "clave_intento"
    `);
  }
}

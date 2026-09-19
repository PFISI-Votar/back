import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VOTAR-497 — capacidad anónima de un solo uso para el relayer de gas.
 * Sin votante_hash, hash_hoja, nullifier, selección ni tx_hash.
 */
export class RelayerCapacidad1787500000000 implements MigrationInterface {
  name = 'RelayerCapacidad1787500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "relayer_capacidad" (
        "id_capacidad" uuid NOT NULL DEFAULT gen_random_uuid(),
        "token_hash" character varying(64) NOT NULL,
        "id_eleccion" integer NOT NULL,
        "expira_en" TIMESTAMP WITH TIME ZONE NOT NULL,
        "consumida_en" TIMESTAMP WITH TIME ZONE,
        "emitida_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_relayer_capacidad" PRIMARY KEY ("id_capacidad"),
        CONSTRAINT "UQ_relayer_capacidad_token_hash" UNIQUE ("token_hash"),
        CONSTRAINT "FK_relayer_capacidad_eleccion"
          FOREIGN KEY ("id_eleccion") REFERENCES "eleccion"("id_eleccion")
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_relayer_capacidad_id_eleccion"
        ON "relayer_capacidad" ("id_eleccion")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_relayer_capacidad_id_eleccion"`,
    );
    await queryRunner.query(`DROP TABLE "relayer_capacidad"`);
  }
}

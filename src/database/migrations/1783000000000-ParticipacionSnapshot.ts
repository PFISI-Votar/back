import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 Tabla de muestras periódicas de participación on-chain (VOTAR-433).
 Elimina la dependencia de eth_getLogs para la curva temporal del dashboard público.
 */
export class ParticipacionSnapshot1783000000000 implements MigrationInterface {
  name = 'ParticipacionSnapshot1783000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "participacion_snapshot" (
        "id_snapshot"   SERIAL PRIMARY KEY,
        "id_eleccion"   INTEGER NOT NULL
                          REFERENCES "eleccion"("id_eleccion") ON DELETE CASCADE,
        "tomado_en"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        "total_votos"   INTEGER NOT NULL DEFAULT 0,
        "votos_blanco"  INTEGER NOT NULL DEFAULT 0,
        "votos_nulo"    INTEGER NOT NULL DEFAULT 0,
        "congelado"     BOOLEAN NOT NULL DEFAULT false
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_participacion_snapshot_eleccion_tomado_en"
      ON "participacion_snapshot" ("id_eleccion", "tomado_en" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_participacion_snapshot_eleccion_tomado_en"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "participacion_snapshot"
    `);
  }
}

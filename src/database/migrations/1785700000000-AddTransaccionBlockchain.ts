import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VOTAR-373: append-only public transaction index (no voter/nullifier FK).
 */
export class AddTransaccionBlockchain1785700000000 implements MigrationInterface {
  name = 'AddTransaccionBlockchain1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "transaccion_blockchain" (
        "hash_transaccion" character varying(66) NOT NULL,
        "id_eleccion" integer NOT NULL,
        "numero_bloque" integer NOT NULL,
        "marca_tiempo" TIMESTAMP WITH TIME ZONE NOT NULL,
        "contrato_etiqueta" character varying(64) NOT NULL,
        "nombre_evento" character varying(256) NOT NULL,
        "descripcion_legible" text NOT NULL,
        "log_index" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_transaccion_blockchain" PRIMARY KEY ("hash_transaccion"),
        CONSTRAINT "FK_transaccion_blockchain_eleccion" FOREIGN KEY ("id_eleccion")
          REFERENCES "eleccion"("id_eleccion") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_transaccion_blockchain_eleccion_bloque"
      ON "transaccion_blockchain" ("id_eleccion", "numero_bloque", "log_index")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_transaccion_blockchain_eleccion_bloque"`,
    );
    await queryRunner.query(`DROP TABLE "transaccion_blockchain"`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VOTAR-328: contador off-chain de intentos de sufragio para feedback en BUD.
 */
export class RegistroIntentoSufragio1782800000000 implements MigrationInterface {
  name = 'RegistroIntentoSufragio1782800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "registro_intento_sufragio" (
        "id_registro" SERIAL NOT NULL,
        "id_eleccion" integer NOT NULL,
        "votante_hash" character varying(64) NOT NULL,
        "votos_consumidos" integer NOT NULL DEFAULT 0,
        "ultimo_intento_at" TIMESTAMP WITH TIME ZONE,
        "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_registro_intento_eleccion_votante"
          UNIQUE ("id_eleccion", "votante_hash"),
        CONSTRAINT "PK_registro_intento_sufragio" PRIMARY KEY ("id_registro"),
        CONSTRAINT "FK_registro_intento_eleccion"
          FOREIGN KEY ("id_eleccion") REFERENCES "eleccion"("id_eleccion")
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_registro_intento_id_eleccion"
        ON "registro_intento_sufragio" ("id_eleccion")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_registro_intento_votante_hash"
        ON "registro_intento_sufragio" ("votante_hash")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_registro_intento_votante_hash"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_registro_intento_id_eleccion"`,
    );
    await queryRunner.query(`DROP TABLE "registro_intento_sufragio"`);
  }
}

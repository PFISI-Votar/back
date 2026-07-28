import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VOTAR-379: elimina la tabla puente votante_hash ↔ payload_hash.
 * La evidencia del sufragio queda on-chain; no hay confirmación off-chain.
 */
export class DropVotoConfirmacion1782700000000 implements MigrationInterface {
  name = 'DropVotoConfirmacion1782700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "voto_confirmacion" DROP CONSTRAINT IF EXISTS "FK_voto_confirmacion_eleccion"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_voto_confirmacion_id_eleccion"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "voto_confirmacion"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."voto_confirmacion_estado_enum"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."voto_confirmacion_estado_enum" AS ENUM('RECIBIDO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "voto_confirmacion" ("id_voto_confirmacion" uuid NOT NULL DEFAULT uuid_generate_v4(), "id_eleccion" integer NOT NULL, "votante_hash" character varying(64) NOT NULL, "idempotency_key" uuid NOT NULL, "payload_hash" character varying(64) NOT NULL, "comprobante_hash" character varying(64) NOT NULL, "estado" "public"."voto_confirmacion_estado_enum" NOT NULL DEFAULT 'RECIBIDO', "recibido_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_voto_confirmacion_eleccion_votante" UNIQUE ("id_eleccion", "votante_hash"), CONSTRAINT "UQ_voto_confirmacion_eleccion_idempotency" UNIQUE ("id_eleccion", "idempotency_key"), CONSTRAINT "PK_voto_confirmacion" PRIMARY KEY ("id_voto_confirmacion"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_voto_confirmacion_id_eleccion" ON "voto_confirmacion" ("id_eleccion")`,
    );
    await queryRunner.query(
      `ALTER TABLE "voto_confirmacion" ADD CONSTRAINT "FK_voto_confirmacion_eleccion" FOREIGN KEY ("id_eleccion") REFERENCES "eleccion"("id_eleccion") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}

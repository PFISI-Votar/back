import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VOTAR-347: pausa de emergencia del comicio con confirmación de 2+ autoridades
 * distintas a nivel de aplicación (PAUSER_ROLE on-chain queda en la wallet
 * operativa del backend; el "n-of-m" se aplica aquí, no en el contrato).
 */
export class PausaComicio1786000000000 implements MigrationInterface {
  name = 'PausaComicio1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."audit_log_tipo_evento_enum" ADD VALUE IF NOT EXISTS 'COMICIO_PAUSADO'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."audit_log_tipo_evento_enum" ADD VALUE IF NOT EXISTS 'COMICIO_REANUDADO'`,
    );

    await queryRunner.query(`
      ALTER TABLE "eleccion"
      ADD COLUMN "pausada" boolean NOT NULL DEFAULT false,
      ADD COLUMN "pausada_en" TIMESTAMP WITH TIME ZONE
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."solicitud_pausa_tipo_enum" AS ENUM('PAUSAR', 'REANUDAR')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."solicitud_pausa_estado_enum" AS ENUM('PENDIENTE', 'EJECUTADA', 'CANCELADA')
    `);
    await queryRunner.query(`
      CREATE TABLE "solicitud_pausa" (
        "id_solicitud" SERIAL NOT NULL,
        "id_eleccion" integer NOT NULL,
        "tipo" "public"."solicitud_pausa_tipo_enum" NOT NULL,
        "razon" text,
        "estado" "public"."solicitud_pausa_estado_enum" NOT NULL DEFAULT 'PENDIENTE',
        "creado_por_hash" character varying NOT NULL,
        "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "ejecutado_en" TIMESTAMP WITH TIME ZONE,
        "tx_hash_ballot" character varying,
        "tx_hash_vote_registry" character varying,
        CONSTRAINT "PK_solicitud_pausa" PRIMARY KEY ("id_solicitud"),
        CONSTRAINT "FK_solicitud_pausa_eleccion" FOREIGN KEY ("id_eleccion")
          REFERENCES "eleccion"("id_eleccion") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    // Un único pedido PENDIENTE por (comicio, tipo) — evita solicitudes duplicadas
    // compitiendo por el mismo umbral de confirmaciones.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_solicitud_pausa_pendiente"
      ON "solicitud_pausa" ("id_eleccion", "tipo")
      WHERE "estado" = 'PENDIENTE'
    `);

    await queryRunner.query(`
      CREATE TABLE "confirmacion_pausa" (
        "id_confirmacion" SERIAL NOT NULL,
        "id_solicitud" integer NOT NULL,
        "actor_hash" character varying NOT NULL,
        "confirmado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_confirmacion_pausa" PRIMARY KEY ("id_confirmacion"),
        CONSTRAINT "UQ_confirmacion_pausa_solicitud_actor" UNIQUE ("id_solicitud", "actor_hash"),
        CONSTRAINT "FK_confirmacion_pausa_solicitud" FOREIGN KEY ("id_solicitud")
          REFERENCES "solicitud_pausa"("id_solicitud") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "confirmacion_pausa"`);
    await queryRunner.query(
      `DROP INDEX "public"."UQ_solicitud_pausa_pendiente"`,
    );
    await queryRunner.query(`DROP TABLE "solicitud_pausa"`);
    await queryRunner.query(`DROP TYPE "public"."solicitud_pausa_estado_enum"`);
    await queryRunner.query(`DROP TYPE "public"."solicitud_pausa_tipo_enum"`);
    await queryRunner.query(`
      ALTER TABLE "eleccion"
      DROP COLUMN "pausada_en",
      DROP COLUMN "pausada"
    `);
    // PostgreSQL no permite remover valores de un ENUM de forma portable;
    // el down deja COMICIO_PAUSADO/COMICIO_REANUDADO en el tipo.
  }
}

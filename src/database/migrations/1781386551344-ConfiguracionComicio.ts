import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConfiguracionComicio1781386551344 implements MigrationInterface {
  name = 'ConfiguracionComicio1781386551344';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."tipo_votacion_enum" AS ENUM('POR_CANDIDATO', 'POR_LISTA', 'MIXTO')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."metodo_autenticacion_enum" AS ENUM('GOOGLE', 'SSO_INSTITUCIONAL')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."politica_revoto_enum" AS ENUM('LAST_VOTE_WINS', 'DISABLED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "eleccion" ADD "tipo_votacion" "public"."tipo_votacion_enum"`,
    );
    await queryRunner.query(
      `UPDATE "eleccion" SET "tipo_votacion" = 'POR_LISTA' WHERE "tipo_votacion" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "eleccion" ALTER COLUMN "tipo_votacion" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "configuracion_comicio" (
        "id_configuracion" SERIAL NOT NULL,
        "id_eleccion" integer NOT NULL,
        "permitir_voto_en_blanco" boolean NOT NULL DEFAULT false,
        "permitir_voto_multiple" boolean NOT NULL DEFAULT false,
        "max_votos_por_votante" integer NOT NULL DEFAULT 1,
        "min_intervalo_segundos" integer NOT NULL DEFAULT 0,
        "mostrar_resultados_tiempo_real" boolean NOT NULL DEFAULT false,
        "duracion_minutos" integer,
        "metodos_autenticacion" "public"."metodo_autenticacion_enum" array NOT NULL,
        "politica_revoto" "public"."politica_revoto_enum" NOT NULL DEFAULT 'DISABLED',
        CONSTRAINT "UQ_configuracion_comicio_id_eleccion" UNIQUE ("id_eleccion"),
        CONSTRAINT "PK_configuracion_comicio" PRIMARY KEY ("id_configuracion"),
        CONSTRAINT "FK_configuracion_comicio_eleccion" FOREIGN KEY ("id_eleccion") REFERENCES "eleccion"("id_eleccion") ON DELETE CASCADE
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "configuracion_comicio"`);
    await queryRunner.query(
      `ALTER TABLE "eleccion" DROP COLUMN "tipo_votacion"`,
    );
    await queryRunner.query(`DROP TYPE "public"."politica_revoto_enum"`);
    await queryRunner.query(`DROP TYPE "public"."metodo_autenticacion_enum"`);
    await queryRunner.query(`DROP TYPE "public"."tipo_votacion_enum"`);
  }
}

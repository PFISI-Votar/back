import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1781996197167 implements MigrationInterface {
  name = 'Migration1781996197167';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."padron_electoral_estado_enum" AS ENUM('BORRADOR', 'PUBLICADO', 'CERRADO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "padron_electoral" ("id_padron" SERIAL NOT NULL, "total_votantes_habilitados" integer NOT NULL, "hash_padron" character varying(64) NOT NULL, "estado" "public"."padron_electoral_estado_enum" NOT NULL DEFAULT 'BORRADOR', "fecha_generacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id_eleccion" integer NOT NULL, CONSTRAINT "REL_624e276b1615e38861dea15eff" UNIQUE ("id_eleccion"), CONSTRAINT "PK_25ed7f33ff2927fe07d8ea0cb60" PRIMARY KEY ("id_padron"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "padron_votante" ("id_padron_votante" uuid NOT NULL DEFAULT uuid_generate_v4(), "indice_hoja" integer NOT NULL, "hash_hoja" character varying(64) NOT NULL, "generado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id_padron" integer NOT NULL, CONSTRAINT "UQ_58d94d3e02aa76cce0535cfecd7" UNIQUE ("id_padron", "hash_hoja"), CONSTRAINT "PK_f3d14510ba50a2d70af7850d585" PRIMARY KEY ("id_padron_votante"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5d1bdc3dd9d8affc670cf6beb1" ON "padron_votante" ("hash_hoja") `,
    );
    await queryRunner.query(
      `ALTER TABLE "padron_electoral" ADD CONSTRAINT "FK_624e276b1615e38861dea15effe" FOREIGN KEY ("id_eleccion") REFERENCES "eleccion"("id_eleccion") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "padron_votante" ADD CONSTRAINT "FK_c2f444d2044489d759b8bcd4601" FOREIGN KEY ("id_padron") REFERENCES "padron_electoral"("id_padron") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "padron_votante" DROP CONSTRAINT "FK_c2f444d2044489d759b8bcd4601"`,
    );
    await queryRunner.query(
      `ALTER TABLE "padron_electoral" DROP CONSTRAINT "FK_624e276b1615e38861dea15effe"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5d1bdc3dd9d8affc670cf6beb1"`,
    );
    await queryRunner.query(`DROP TABLE "padron_votante"`);
    await queryRunner.query(`DROP TABLE "padron_electoral"`);
    await queryRunner.query(
      `DROP TYPE "public"."padron_electoral_estado_enum"`,
    );
  }
}

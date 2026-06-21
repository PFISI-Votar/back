import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConfiguracionDatosCandidato1781386551342 implements MigrationInterface {
  name = 'ConfiguracionDatosCandidato1781386551342';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "configuracion_datos_candidato" (
        "id_configuracion" SERIAL NOT NULL,
        "id_eleccion" integer NOT NULL,
        "campos" jsonb NOT NULL,
        "fecha_creacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "fecha_actualizacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_config_datos_candidato_eleccion" UNIQUE ("id_eleccion"),
        CONSTRAINT "PK_configuracion_datos_candidato" PRIMARY KEY ("id_configuracion"),
        CONSTRAINT "FK_config_datos_candidato_eleccion" FOREIGN KEY ("id_eleccion") REFERENCES "eleccion"("id_eleccion") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "candidato" RENAME COLUMN "ficha_institucional" TO "datos_adicionales"`,
    );
    await queryRunner.query(
      `UPDATE "candidato" SET "datos_adicionales" = jsonb_build_object(
        'legajo_utn', COALESCE("datos_adicionales"->>'legajoUtn', "datos_adicionales"->>'legajo_utn'),
        'dni', "datos_adicionales"->>'dni',
        'cantidad_avales', COALESCE(
          ("datos_adicionales"->>'cantidadAvales')::int,
          ("datos_adicionales"->>'cantidad_avales')::int
        )
      ) WHERE "datos_adicionales" IS NOT NULL`,
    );
    const elecciones = (await queryRunner.query(
      `SELECT id_eleccion FROM eleccion`,
    )) as { id_eleccion: number }[];
    const camposJson = '[]';
    for (const eleccion of elecciones) {
      await queryRunner.query(
        `INSERT INTO "configuracion_datos_candidato" ("id_eleccion", "campos")
         VALUES (${eleccion.id_eleccion}, '${camposJson}'::jsonb)
         ON CONFLICT DO NOTHING`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "candidato" SET "datos_adicionales" = jsonb_build_object(
        'legajoUtn', "datos_adicionales"->>'legajo_utn',
        'dni', "datos_adicionales"->>'dni',
        'cantidadAvales', ("datos_adicionales"->>'cantidad_avales')::int
      ) WHERE "datos_adicionales" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "candidato" RENAME COLUMN "datos_adicionales" TO "ficha_institucional"`,
    );
    await queryRunner.query(`DROP TABLE "configuracion_datos_candidato"`);
  }
}

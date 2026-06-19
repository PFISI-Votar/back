import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeCampoDatosCandidato1781386551343 implements MigrationInterface {
  name = 'NormalizeCampoDatosCandidato1781386551343';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."tipo_campo_candidato_enum" AS ENUM('texto', 'numero', 'email', 'url', 'fecha', 'booleano')`,
    );
    await queryRunner.query(
      `CREATE TABLE "campo_datos_candidato" (
        "id_campo" SERIAL NOT NULL,
        "id_configuracion" integer NOT NULL,
        "clave" character varying(50) NOT NULL,
        "etiqueta" character varying(100) NOT NULL,
        "tipo" "public"."tipo_campo_candidato_enum" NOT NULL,
        "obligatorio" boolean NOT NULL DEFAULT true,
        "ejemplo" character varying(255),
        "ayuda" character varying(500),
        "orden" integer NOT NULL,
        "min_length" integer,
        "max_length" integer,
        "min_valor" double precision,
        "max_valor" double precision,
        "pattern" character varying(500),
        "pattern_message" character varying(255),
        CONSTRAINT "PK_campo_datos_candidato" PRIMARY KEY ("id_campo"),
        CONSTRAINT "UQ_campo_config_clave" UNIQUE ("id_configuracion", "clave"),
        CONSTRAINT "UQ_campo_config_orden" UNIQUE ("id_configuracion", "orden"),
        CONSTRAINT "FK_campo_configuracion" FOREIGN KEY ("id_configuracion") REFERENCES "configuracion_datos_candidato"("id_configuracion") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `INSERT INTO "campo_datos_candidato" (
        "id_configuracion",
        "clave",
        "etiqueta",
        "tipo",
        "obligatorio",
        "ejemplo",
        "ayuda",
        "orden",
        "min_length",
        "max_length",
        "min_valor",
        "max_valor",
        "pattern",
        "pattern_message"
      )
      SELECT
        config.id_configuracion,
        campo->>'clave',
        campo->>'etiqueta',
        (campo->>'tipo')::"public"."tipo_campo_candidato_enum",
        COALESCE((campo->>'obligatorio')::boolean, true),
        NULLIF(campo->>'ejemplo', ''),
        NULLIF(campo->>'ayuda', ''),
        (campo->>'orden')::integer,
        (campo->'validacion'->>'minLength')::integer,
        (campo->'validacion'->>'maxLength')::integer,
        (campo->'validacion'->>'min')::double precision,
        (campo->'validacion'->>'max')::double precision,
        NULLIF(campo->'validacion'->>'pattern', ''),
        NULLIF(campo->'validacion'->>'patternMessage', '')
      FROM "configuracion_datos_candidato" config
      CROSS JOIN LATERAL jsonb_array_elements(config.campos) AS campo
      WHERE jsonb_typeof(config.campos) = 'array'
        AND jsonb_array_length(config.campos) > 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "configuracion_datos_candidato" DROP COLUMN "campos"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "configuracion_datos_candidato" ADD COLUMN "campos" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `UPDATE "configuracion_datos_candidato" config
       SET "campos" = COALESCE(
         (
           SELECT jsonb_agg(
             jsonb_strip_nulls(
               jsonb_build_object(
                 'clave', campo.clave,
                 'etiqueta', campo.etiqueta,
                 'tipo', campo.tipo,
                 'obligatorio', campo.obligatorio,
                 'ejemplo', campo.ejemplo,
                 'ayuda', campo.ayuda,
                 'orden', campo.orden,
                 'validacion', jsonb_strip_nulls(
                   jsonb_build_object(
                     'minLength', campo.min_length,
                     'maxLength', campo.max_length,
                     'min', campo.min_valor,
                     'max', campo.max_valor,
                     'pattern', campo.pattern,
                     'patternMessage', campo.pattern_message
                   )
                 )
               )
             )
             ORDER BY campo.orden
           )
           FROM "campo_datos_candidato" campo
           WHERE campo.id_configuracion = config.id_configuracion
         ),
         '[]'::jsonb
       )`,
    );
    await queryRunner.query(`DROP TABLE "campo_datos_candidato"`);
    await queryRunner.query(`DROP TYPE "public"."tipo_campo_candidato_enum"`);
  }
}

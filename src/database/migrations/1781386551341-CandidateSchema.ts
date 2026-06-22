import { MigrationInterface, QueryRunner } from 'typeorm';

export class CandidateSchema1781386551341 implements MigrationInterface {
  name = 'CandidateSchema1781386551341';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."estado_boleta_enum" AS ENUM('BORRADOR', 'PUBLICADA', 'CERRADA')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."estado_lista_enum" AS ENUM('BORRADOR', 'OFICIALIZADA', 'INHABILITADA')`,
    );
    await queryRunner.query(
      `CREATE TABLE "boleta" (
        "id_boleta" SERIAL NOT NULL,
        "id_eleccion" integer NOT NULL,
        "titulo" character varying NOT NULL,
        "fecha_publicacion" TIMESTAMP WITH TIME ZONE,
        "estado" "public"."estado_boleta_enum" NOT NULL DEFAULT 'BORRADOR',
        CONSTRAINT "UQ_boleta_id_eleccion" UNIQUE ("id_eleccion"),
        CONSTRAINT "PK_boleta" PRIMARY KEY ("id_boleta"),
        CONSTRAINT "FK_boleta_eleccion" FOREIGN KEY ("id_eleccion") REFERENCES "eleccion"("id_eleccion") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE "categoria" (
        "id_categoria" SERIAL NOT NULL,
        "id_boleta" integer NOT NULL,
        "nombre" character varying NOT NULL,
        "descripcion" character varying,
        "cantidad_cargos" integer NOT NULL DEFAULT 1,
        "orden" integer NOT NULL DEFAULT 1,
        CONSTRAINT "PK_categoria" PRIMARY KEY ("id_categoria"),
        CONSTRAINT "FK_categoria_boleta" FOREIGN KEY ("id_boleta") REFERENCES "boleta"("id_boleta") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE "lista" (
        "id_lista" SERIAL NOT NULL,
        "id_boleta" integer NOT NULL,
        "nombre" character varying NOT NULL,
        "sigla" character varying NOT NULL,
        "color" character varying,
        "fecha_oficializacion" TIMESTAMP WITH TIME ZONE,
        "estado" "public"."estado_lista_enum" NOT NULL DEFAULT 'BORRADOR',
        "list_id" integer,
        CONSTRAINT "PK_lista" PRIMARY KEY ("id_lista"),
        CONSTRAINT "UQ_lista_boleta_sigla" UNIQUE ("id_boleta", "sigla"),
        CONSTRAINT "UQ_lista_boleta_list_id" UNIQUE ("id_boleta", "list_id"),
        CONSTRAINT "FK_lista_boleta" FOREIGN KEY ("id_boleta") REFERENCES "boleta"("id_boleta") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE "candidato" (
        "id_candidato" SERIAL NOT NULL,
        "id_lista" integer NOT NULL,
        "id_categoria" integer NOT NULL,
        "nombre" character varying NOT NULL,
        "apellido" character varying NOT NULL,
        "cargo" character varying,
        "orden" integer NOT NULL DEFAULT 1,
        "foto_url" character varying,
        "ficha_institucional" jsonb NOT NULL,
        CONSTRAINT "PK_candidato" PRIMARY KEY ("id_candidato"),
        CONSTRAINT "FK_candidato_lista" FOREIGN KEY ("id_lista") REFERENCES "lista"("id_lista") ON DELETE CASCADE,
        CONSTRAINT "FK_candidato_categoria" FOREIGN KEY ("id_categoria") REFERENCES "categoria"("id_categoria") ON DELETE RESTRICT
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "candidato"`);
    await queryRunner.query(`DROP TABLE "lista"`);
    await queryRunner.query(`DROP TABLE "categoria"`);
    await queryRunner.query(`DROP TABLE "boleta"`);
    await queryRunner.query(`DROP TYPE "public"."estado_lista_enum"`);
    await queryRunner.query(`DROP TYPE "public"."estado_boleta_enum"`);
  }
}

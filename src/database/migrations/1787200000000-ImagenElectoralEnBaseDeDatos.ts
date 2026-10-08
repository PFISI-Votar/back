import { MigrationInterface, QueryRunner } from 'typeorm';

const LEGACY_PUBLIC_ROOT = '/uploads';

/**
 * VOTAR-466 — crea `imagen_electoral` (bytea) y deja de depender del disco
 * local del contenedor para servir imágenes. Antes, la fila de dominio
 * (candidato.foto_url, lista.logo_url, configuracion_sistema.logo_url)
 * persistía en el volumen de Postgres pero el archivo referenciado vivía en
 * el filesystem efímero del contenedor `back` y se perdía al recrearlo,
 * dejando referencias `/uploads/...` rotas.
 *
 * Sin backfill (decisión de equipo, VOTAR-466): en vez de leer los archivos
 * del disco durante la migración, se nulifican las referencias legacy —
 * `/uploads/...` ya no se sirve (ver ElectoralImageController) — y se
 * regeneran con `npm run db:reset` / `npm run seed`. Las imágenes subidas a
 * mano en un entorno con datos reales deben volver a cargarse manualmente
 * tras aplicar esta migración.
 */
export class ImagenElectoralEnBaseDeDatos1787200000000 implements MigrationInterface {
  name = 'ImagenElectoralEnBaseDeDatos1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "imagen_electoral" (
        "id_imagen" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tipo" character varying(32) NOT NULL,
        "mime_type" character varying(64) NOT NULL DEFAULT 'image/webp',
        "contenido" bytea NOT NULL,
        "tamano_bytes" integer NOT NULL,
        "checksum_sha256" character(64) NOT NULL,
        "ancho" integer NOT NULL,
        "alto" integer NOT NULL,
        "fecha_creacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_imagen_electoral" PRIMARY KEY ("id_imagen")
      )
    `);

    // El contenido ya está comprimido (WebP): evitar que TOAST intente
    // recomprimirlo en cada INSERT.
    await queryRunner.query(
      `ALTER TABLE "imagen_electoral" ALTER COLUMN "contenido" SET STORAGE EXTERNAL`,
    );

    await queryRunner.query(
      `UPDATE "candidato" SET "foto_url" = NULL WHERE "foto_url" LIKE '${LEGACY_PUBLIC_ROOT}/%'`,
    );
    await queryRunner.query(
      `UPDATE "lista" SET "logo_url" = NULL WHERE "logo_url" LIKE '${LEGACY_PUBLIC_ROOT}/%'`,
    );
    await queryRunner.query(
      `UPDATE "configuracion_sistema" SET "logo_url" = NULL WHERE "logo_url" LIKE '${LEGACY_PUBLIC_ROOT}/%'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Las URLs legacy fueron nulificadas deliberadamente en up() y no son
    // recuperables desde acá; la recuperación de datos de ejemplo es
    // `npm run db:reset`. down() solo revierte el esquema.
    await queryRunner.query(`DROP TABLE "imagen_electoral"`);
  }
}

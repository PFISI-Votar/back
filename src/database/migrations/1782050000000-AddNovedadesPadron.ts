import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-331: persiste el reporte de novedades de la importación del padrón
 * (totales + filas omitidas) para permitir la re-descarga del archivo de
 * auditoría. Las novedades sólo guardan línea + tipo + motivo (sin PII).
 */
export class AddNovedadesPadron1782050000000 implements MigrationInterface {
  name = 'AddNovedadesPadron1782050000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "padron_electoral" ADD "total_procesados" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "padron_electoral" ADD "total_omitidos" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "padron_electoral" ADD "novedades" jsonb NOT NULL DEFAULT '[]'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "padron_electoral" DROP COLUMN "novedades"`,
    );
    await queryRunner.query(
      `ALTER TABLE "padron_electoral" DROP COLUMN "total_omitidos"`,
    );
    await queryRunner.query(
      `ALTER TABLE "padron_electoral" DROP COLUMN "total_procesados"`,
    );
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VOTAR-322: agrega el estado ARCHIVADA (comicios CERRADA archivados,
 * removidos del panel de gestión activa) y el evento de auditoría
 * COMICIO_ARCHIVADO.
 */
export class AddEleccionArchivada1785800000000 implements MigrationInterface {
  name = 'AddEleccionArchivada1785800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."eleccion_estado_enum" ADD VALUE IF NOT EXISTS 'ARCHIVADA'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."audit_log_tipo_evento_enum" ADD VALUE IF NOT EXISTS 'COMICIO_ARCHIVADO'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL no permite remover valores de un ENUM de forma portable;
    // el down deja los valores ARCHIVADA y COMICIO_ARCHIVADO en los tipos.
  }
}

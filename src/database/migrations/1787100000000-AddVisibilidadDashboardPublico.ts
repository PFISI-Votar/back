import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VOTAR-459: permite a la autoridad electoral ocultar del Dashboard Público
 * las solapas Resultados, Participación, Re-voto y Transacciones mientras el
 * comicio está en curso, para evitar inducir comportamiento estratégico del
 * electorado con datos parciales en vivo. Todas por defecto en `true` para
 * no alterar el comportamiento de comicios ya existentes.
 */
export class AddVisibilidadDashboardPublico1787100000000 implements MigrationInterface {
  name = 'AddVisibilidadDashboardPublico1787100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "configuracion_comicio"
      ADD "mostrar_dashboard_resultados" boolean NOT NULL DEFAULT true,
      ADD "mostrar_dashboard_participacion" boolean NOT NULL DEFAULT true,
      ADD "mostrar_dashboard_revoto" boolean NOT NULL DEFAULT true,
      ADD "mostrar_dashboard_transacciones" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "configuracion_comicio"
      DROP COLUMN "mostrar_dashboard_transacciones",
      DROP COLUMN "mostrar_dashboard_revoto",
      DROP COLUMN "mostrar_dashboard_participacion",
      DROP COLUMN "mostrar_dashboard_resultados"
    `);
  }
}

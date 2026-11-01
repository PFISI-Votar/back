import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VOTAR-524: pop-up de alerta configurable por comicio que la BUD muestra
 * antes de comenzar. Deshabilitado por defecto para no alterar los comicios
 * existentes. Los largos son literales a proposito: una migracion no debe
 * cambiar si cambian las constantes de la aplicacion.
 */
export class AddPopupAlertaConfiguracionComicio1787700000000 implements MigrationInterface {
  name = 'AddPopupAlertaConfiguracionComicio1787700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "configuracion_comicio"
      ADD "popup_alerta_habilitado" boolean NOT NULL DEFAULT false,
      ADD "popup_alerta_titulo" character varying(100),
      ADD "popup_alerta_descripcion" character varying(1000)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "configuracion_comicio"
      DROP COLUMN "popup_alerta_descripcion",
      DROP COLUMN "popup_alerta_titulo",
      DROP COLUMN "popup_alerta_habilitado"
    `);
  }
}

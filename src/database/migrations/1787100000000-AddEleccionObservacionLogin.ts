import { MigrationInterface, QueryRunner } from 'typeorm';

const OBSERVACION_LOGIN_DEFAULT =
  'El acceso se realiza con tu cuenta institucional. Para poder emitir el voto, el correo electrónico cargado en la sección Datos Personales de Autogestión debe coincidir con el registrado en el padrón electoral.';

export class AddEleccionObservacionLogin1787100000000 implements MigrationInterface {
  name = 'AddEleccionObservacionLogin1787100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const escapedDefault = OBSERVACION_LOGIN_DEFAULT.replace(/'/g, "''");
    await queryRunner.query(
      `ALTER TABLE "eleccion" ADD "observacion_login" character varying(1000) DEFAULT '${escapedDefault}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "eleccion" DROP COLUMN "observacion_login"`,
    );
  }
}

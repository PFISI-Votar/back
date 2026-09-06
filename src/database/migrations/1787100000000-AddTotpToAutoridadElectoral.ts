import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VOTAR-458: columnas TOTP para 2FA del panel de autoridad electoral.
 */
export class AddTotpToAutoridadElectoral1787100000000 implements MigrationInterface {
  name = 'AddTotpToAutoridadElectoral1787100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "autoridad_electoral" ADD "totp_secret" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "autoridad_electoral" ADD "totp_enabled" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "autoridad_electoral" DROP COLUMN "totp_enabled"`,
    );
    await queryRunner.query(
      `ALTER TABLE "autoridad_electoral" DROP COLUMN "totp_secret"`,
    );
  }
}

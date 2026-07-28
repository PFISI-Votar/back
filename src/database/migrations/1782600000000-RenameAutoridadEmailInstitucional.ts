import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VOTAR-415: renombra email_institucional → email en autoridad_electoral.
 */
export class RenameAutoridadEmailInstitucional1782600000000 implements MigrationInterface {
  name = 'RenameAutoridadEmailInstitucional1782600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "autoridad_electoral" RENAME CONSTRAINT "UQ_autoridad_electoral_email_institucional" TO "UQ_autoridad_electoral_email"`,
    );
    await queryRunner.query(
      `ALTER TABLE "autoridad_electoral" RENAME COLUMN "email_institucional" TO "email"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "autoridad_electoral" RENAME COLUMN "email" TO "email_institucional"`,
    );
    await queryRunner.query(
      `ALTER TABLE "autoridad_electoral" RENAME CONSTRAINT "UQ_autoridad_electoral_email" TO "UQ_autoridad_electoral_email_institucional"`,
    );
  }
}

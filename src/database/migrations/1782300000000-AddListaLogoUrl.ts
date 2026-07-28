import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddListaLogoUrl1782300000000 implements MigrationInterface {
  name = 'AddListaLogoUrl1782300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "lista" ADD "logo_url" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "lista" DROP COLUMN "logo_url"`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveCandidatoCargo1781386551345 implements MigrationInterface {
  name = 'RemoveCandidatoCargo1781386551345';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "candidato" DROP COLUMN "cargo"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "candidato" ADD "cargo" character varying`,
    );
  }
}

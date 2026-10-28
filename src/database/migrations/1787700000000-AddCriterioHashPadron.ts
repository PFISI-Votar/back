import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCriterioHashPadron1787700000000 implements MigrationInterface {
  name = 'AddCriterioHashPadron1787700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."padron_electoral_criterio_hash_enum" AS ENUM('DNI', 'EMAIL', 'DNI_Y_EMAIL')`,
    );
    await queryRunner.query(
      `ALTER TABLE "padron_electoral" ADD "criterio_hash" "public"."padron_electoral_criterio_hash_enum" NOT NULL DEFAULT 'DNI'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "padron_electoral" DROP COLUMN "criterio_hash"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."padron_electoral_criterio_hash_enum"`,
    );
  }
}

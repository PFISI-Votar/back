import { MigrationInterface, QueryRunner } from 'typeorm';

export class CategoriaMinimoPostulantes1781386551346 implements MigrationInterface {
  name = 'CategoriaMinimoPostulantes1781386551346';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "categoria" ADD "minimo_postulantes" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "categoria" DROP COLUMN "minimo_postulantes"`,
    );
  }
}

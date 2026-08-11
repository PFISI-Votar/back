import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConfiguracionComicioPermitirVotoNulo1785600000000 implements MigrationInterface {
  name = 'AddConfiguracionComicioPermitirVotoNulo1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "configuracion_comicio" ADD "permitir_voto_nulo" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "configuracion_comicio" DROP COLUMN "permitir_voto_nulo"`,
    );
  }
}

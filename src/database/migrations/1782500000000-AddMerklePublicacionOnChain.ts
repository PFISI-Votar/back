import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VOTAR-335: persiste metadatos de la publicación on-chain del sello Merkle.
 */
export class AddMerklePublicacionOnChain1782500000000 implements MigrationInterface {
  name = 'AddMerklePublicacionOnChain1782500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "merkle_tree" ADD "tx_hash_publicacion" character varying(66)`,
    );
    await queryRunner.query(
      `ALTER TABLE "merkle_tree" ADD "numero_bloque" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "merkle_tree" ADD "fecha_publicacion_on_chain" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "merkle_tree" ADD "direccion_contrato" character varying(42)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "merkle_tree" DROP COLUMN "direccion_contrato"`,
    );
    await queryRunner.query(
      `ALTER TABLE "merkle_tree" DROP COLUMN "fecha_publicacion_on_chain"`,
    );
    await queryRunner.query(
      `ALTER TABLE "merkle_tree" DROP COLUMN "numero_bloque"`,
    );
    await queryRunner.query(
      `ALTER TABLE "merkle_tree" DROP COLUMN "tx_hash_publicacion"`,
    );
  }
}

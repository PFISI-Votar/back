import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VOTAR-334: persiste el árbol de Merkle del padrón (raíz + dump serializado)
 * para consolidación criptográfica y verificación on-demand de proofs.
 */
export class AddMerkleTree1782400000000 implements MigrationInterface {
  name = 'AddMerkleTree1782400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."merkle_tree_estado_enum" AS ENUM('GENERADO', 'ACTIVO', 'PUBLICADO_ON_CHAIN', 'OBSOLETO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "merkle_tree" (
        "id_merkle_tree" SERIAL NOT NULL,
        "merkle_root" character varying(66) NOT NULL,
        "total_hojas" integer NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "estado" "public"."merkle_tree_estado_enum" NOT NULL DEFAULT 'GENERADO',
        "tree_dump" jsonb NOT NULL,
        "fecha_generacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "id_padron" integer NOT NULL,
        CONSTRAINT "UQ_merkle_tree_id_padron" UNIQUE ("id_padron"),
        CONSTRAINT "PK_merkle_tree" PRIMARY KEY ("id_merkle_tree")
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "merkle_tree" ADD CONSTRAINT "FK_merkle_tree_padron" FOREIGN KEY ("id_padron") REFERENCES "padron_electoral"("id_padron") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "merkle_tree" DROP CONSTRAINT "FK_merkle_tree_padron"`,
    );
    await queryRunner.query(`DROP TABLE "merkle_tree"`);
    await queryRunner.query(`DROP TYPE "public"."merkle_tree_estado_enum"`);
  }
}

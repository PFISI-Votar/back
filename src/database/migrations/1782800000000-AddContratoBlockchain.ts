import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VOTAR-337: tabla para registrar dirección + ABI del ElectionFactory (contrato maestro).
 */
export class AddContratoBlockchain1782800000000 implements MigrationInterface {
  name = 'AddContratoBlockchain1782800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."contrato_blockchain_tipo_enum" AS ENUM('ELECTION_FACTORY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."contrato_blockchain_red_enum" AS ENUM('LOCALHOST', 'SEPOLIA', 'MAINNET')`,
    );
    await queryRunner.query(`
      CREATE TABLE "contrato_blockchain" (
        "id_contrato" SERIAL NOT NULL,
        "tipo" "public"."contrato_blockchain_tipo_enum" NOT NULL,
        "nombre" character varying(128) NOT NULL,
        "direccion_contrato" character varying(42) NOT NULL,
        "abi" jsonb NOT NULL,
        "abi_hash" character varying(66) NOT NULL,
        "red" "public"."contrato_blockchain_red_enum" NOT NULL,
        "chain_id" integer NOT NULL,
        "tx_hash_despliegue" character varying(66),
        "fecha_despliegue" TIMESTAMP WITH TIME ZONE,
        "verificado_etherscan" boolean NOT NULL DEFAULT false,
        "merkle_root_store_address" character varying(42),
        "admin_address" character varying(42),
        "fecha_registro" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "fecha_actualizacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_contrato_blockchain_direccion" UNIQUE ("direccion_contrato"),
        CONSTRAINT "UQ_contrato_blockchain_tipo_red" UNIQUE ("tipo", "red"),
        CONSTRAINT "PK_contrato_blockchain" PRIMARY KEY ("id_contrato")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "contrato_blockchain"`);
    await queryRunner.query(
      `DROP TYPE "public"."contrato_blockchain_red_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."contrato_blockchain_tipo_enum"`,
    );
  }
}

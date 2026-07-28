import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefreshSession1782300000000 implements MigrationInterface {
  name = 'RefreshSession1782300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "refresh_session" (
        "id_session" SERIAL NOT NULL,
        "token_hash" character varying(64) NOT NULL,
        "identificador_sso" character varying NOT NULL,
        "sub" character varying NOT NULL,
        "email" character varying,
        "nombre" character varying,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_session" PRIMARY KEY ("id_session"),
        CONSTRAINT "UQ_refresh_session_token_hash" UNIQUE ("token_hash")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_refresh_session_identificador_sso"
      ON "refresh_session" ("identificador_sso")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_refresh_session_identificador_sso"`,
    );
    await queryRunner.query(`DROP TABLE "refresh_session"`);
  }
}

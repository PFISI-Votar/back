import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-313: tablas AUTORIDAD_ELECTORAL y AUDIT_LOG para login de autoridad
 * y registro de intentos de acceso no autorizado.
 */
export class AuthAutoridadAuditLog1782200000000 implements MigrationInterface {
  name = 'AuthAutoridadAuditLog1782200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."autoridad_electoral_rol_enum" AS ENUM(
        'ELECTION_ADMIN',
        'PAUSER',
        'MERKLE_UPDATER'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "autoridad_electoral" (
        "id_autoridad" SERIAL NOT NULL,
        "identificador_sso" character varying NOT NULL,
        "email_institucional" character varying NOT NULL,
        "nombre" character varying NOT NULL,
        "rol" "public"."autoridad_electoral_rol_enum" NOT NULL,
        "fecha_registro" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_autoridad_electoral_identificador_sso" UNIQUE ("identificador_sso"),
        CONSTRAINT "UQ_autoridad_electoral_email_institucional" UNIQUE ("email_institucional"),
        CONSTRAINT "PK_autoridad_electoral" PRIMARY KEY ("id_autoridad")
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."audit_log_tipo_evento_enum" AS ENUM(
        'ACCESO_DENEGADO',
        'LOGIN',
        'CONFIG_MODIFICADA',
        'PADRON_CARGADO',
        'COMICIO_ABIERTO',
        'COMICIO_CERRADO'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "audit_log" (
        "id_log" SERIAL NOT NULL,
        "id_eleccion" integer,
        "tipo_evento" "public"."audit_log_tipo_evento_enum" NOT NULL,
        "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "actor" character varying NOT NULL,
        "descripcion" character varying,
        "hash_registro" character varying,
        "ip_origen" character varying NOT NULL,
        "endpoint" character varying NOT NULL,
        "datos_adicionales" jsonb,
        CONSTRAINT "PK_audit_log" PRIMARY KEY ("id_log")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "audit_log"
      ADD CONSTRAINT "FK_audit_log_eleccion"
      FOREIGN KEY ("id_eleccion") REFERENCES "eleccion"("id_eleccion")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      INSERT INTO "autoridad_electoral" (
        "identificador_sso",
        "email_institucional",
        "nombre",
        "rol"
      ) VALUES (
        'votar.admin',
        'admin@votar.local',
        'Administrador de Prueba VOTAR',
        'ELECTION_ADMIN'
      )
      ON CONFLICT ("identificador_sso") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audit_log" DROP CONSTRAINT "FK_audit_log_eleccion"`,
    );
    await queryRunner.query(`DROP TABLE "audit_log"`);
    await queryRunner.query(`DROP TYPE "public"."audit_log_tipo_evento_enum"`);
    await queryRunner.query(`DROP TABLE "autoridad_electoral"`);
    await queryRunner.query(
      `DROP TYPE "public"."autoridad_electoral_rol_enum"`,
    );
  }
}

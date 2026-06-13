import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1781386551340 implements MigrationInterface {
    name = 'Migration1781386551340'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."eleccion_estado_enum" AS ENUM('BORRADOR', 'CONFIGURADA', 'ABIERTA', 'CERRADA', 'ESCRUTADA')`);
        await queryRunner.query(`CREATE TABLE "eleccion" ("id_eleccion" SERIAL NOT NULL, "nombre" character varying NOT NULL, "descripcion" character varying, "fecha_inicio" TIMESTAMP WITH TIME ZONE NOT NULL, "fecha_fin" TIMESTAMP WITH TIME ZONE NOT NULL, "estado" "public"."eleccion_estado_enum" NOT NULL DEFAULT 'BORRADOR', "minimo_candidatos_por_lista" integer, "fecha_creacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "fecha_actualizacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6f0c8ca10d609fe7631a18e0f3d" PRIMARY KEY ("id_eleccion"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "eleccion"`);
        await queryRunner.query(`DROP TYPE "public"."eleccion_estado_enum"`);
    }

}

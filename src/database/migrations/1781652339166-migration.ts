import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1781652339166 implements MigrationInterface {
    name = 'Migration1781652339166'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "categoria" ("id_categoria" SERIAL NOT NULL, "id_eleccion" integer NOT NULL, "nombre" character varying(100) NOT NULL, "descripcion" character varying(500), "cantidad_cargos" integer NOT NULL DEFAULT '1', "orden" integer NOT NULL DEFAULT '1', "fecha_creacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "fecha_actualizacion" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_950063d23664f5aaec4dcada4d4" PRIMARY KEY ("id_categoria"))`);
        await queryRunner.query(`ALTER TABLE "categoria" ADD CONSTRAINT "FK_9f8ef62d2d3903b41ca34744bb9" FOREIGN KEY ("id_eleccion") REFERENCES "eleccion"("id_eleccion") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "categoria" DROP CONSTRAINT "FK_9f8ef62d2d3903b41ca34744bb9"`);
        await queryRunner.query(`DROP TABLE "categoria"`);
    }

}

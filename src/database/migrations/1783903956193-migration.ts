import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1783903956193 implements MigrationInterface {
  name = 'Migration1783903956193';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "voto_confirmacion" DROP CONSTRAINT "FK_voto_confirmacion_eleccion"`,
    );
    await queryRunner.query(
      `ALTER TABLE "configuracion_comicio" DROP CONSTRAINT "FK_configuracion_comicio_eleccion"`,
    );
    await queryRunner.query(
      `ALTER TABLE "merkle_tree" DROP CONSTRAINT "FK_merkle_tree_padron"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_log" DROP CONSTRAINT "FK_audit_log_eleccion"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campo_datos_candidato" DROP CONSTRAINT "FK_campo_configuracion"`,
    );
    await queryRunner.query(
      `ALTER TABLE "configuracion_datos_candidato" DROP CONSTRAINT "FK_config_datos_candidato_eleccion"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lista" DROP CONSTRAINT "FK_lista_boleta"`,
    );
    await queryRunner.query(
      `ALTER TABLE "boleta" DROP CONSTRAINT "FK_boleta_eleccion"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categoria" DROP CONSTRAINT "FK_categoria_boleta"`,
    );
    await queryRunner.query(
      `ALTER TABLE "candidato" DROP CONSTRAINT "FK_candidato_categoria"`,
    );
    await queryRunner.query(
      `ALTER TABLE "candidato" DROP CONSTRAINT "FK_candidato_lista"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_voto_confirmacion_id_eleccion"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_voto_confirmacion_codigo_verificacion_e2e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_voto_confirmacion_tx_hash"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_refresh_session_identificador_sso"`,
    );
    await queryRunner.query(
      `ALTER TABLE "voto_confirmacion" DROP CONSTRAINT "UQ_voto_confirmacion_eleccion_votante"`,
    );
    await queryRunner.query(
      `ALTER TABLE "voto_confirmacion" DROP CONSTRAINT "UQ_voto_confirmacion_eleccion_idempotency"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campo_datos_candidato" DROP CONSTRAINT "UQ_campo_config_clave"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campo_datos_candidato" DROP CONSTRAINT "UQ_campo_config_orden"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lista" DROP CONSTRAINT "UQ_lista_boleta_sigla"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lista" DROP CONSTRAINT "UQ_lista_boleta_list_id"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."metodo_autenticacion_enum" RENAME TO "metodo_autenticacion_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."configuracion_comicio_metodos_autenticacion_enum" AS ENUM('GOOGLE', 'SSO_INSTITUCIONAL')`,
    );
    await queryRunner.query(
      `ALTER TABLE "configuracion_comicio" ALTER COLUMN "metodos_autenticacion" TYPE "public"."configuracion_comicio_metodos_autenticacion_enum"[] USING "metodos_autenticacion"::"text"::"public"."configuracion_comicio_metodos_autenticacion_enum"[]`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."metodo_autenticacion_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."politica_revoto_enum" RENAME TO "politica_revoto_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."configuracion_comicio_politica_revoto_enum" AS ENUM('LAST_VOTE_WINS', 'DISABLED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "configuracion_comicio" ALTER COLUMN "politica_revoto" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "configuracion_comicio" ALTER COLUMN "politica_revoto" TYPE "public"."configuracion_comicio_politica_revoto_enum" USING "politica_revoto"::"text"::"public"."configuracion_comicio_politica_revoto_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "configuracion_comicio" ALTER COLUMN "politica_revoto" SET DEFAULT 'DISABLED'`,
    );
    await queryRunner.query(`DROP TYPE "public"."politica_revoto_enum_old"`);
    await queryRunner.query(
      `ALTER TYPE "public"."tipo_votacion_enum" RENAME TO "tipo_votacion_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."eleccion_tipo_votacion_enum" AS ENUM('POR_CANDIDATO', 'POR_LISTA', 'MIXTO')`,
    );
    await queryRunner.query(
      `ALTER TABLE "eleccion" ALTER COLUMN "tipo_votacion" TYPE "public"."eleccion_tipo_votacion_enum" USING "tipo_votacion"::"text"::"public"."eleccion_tipo_votacion_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."tipo_votacion_enum_old"`);
    await queryRunner.query(
      `ALTER TABLE "refresh_session" DROP CONSTRAINT "UQ_refresh_session_token_hash"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."tipo_campo_candidato_enum" RENAME TO "tipo_campo_candidato_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."campo_datos_candidato_tipo_enum" AS ENUM('texto', 'numero', 'email', 'url', 'fecha', 'booleano')`,
    );
    await queryRunner.query(
      `ALTER TABLE "campo_datos_candidato" ALTER COLUMN "tipo" TYPE "public"."campo_datos_candidato_tipo_enum" USING "tipo"::"text"::"public"."campo_datos_candidato_tipo_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."tipo_campo_candidato_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."estado_lista_enum" RENAME TO "estado_lista_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."lista_estado_enum" AS ENUM('BORRADOR', 'OFICIALIZADA', 'INHABILITADA')`,
    );
    await queryRunner.query(
      `ALTER TABLE "lista" ALTER COLUMN "estado" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "lista" ALTER COLUMN "estado" TYPE "public"."lista_estado_enum" USING "estado"::"text"::"public"."lista_estado_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lista" ALTER COLUMN "estado" SET DEFAULT 'BORRADOR'`,
    );
    await queryRunner.query(`DROP TYPE "public"."estado_lista_enum_old"`);
    await queryRunner.query(
      `ALTER TYPE "public"."estado_boleta_enum" RENAME TO "estado_boleta_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."boleta_estado_enum" AS ENUM('BORRADOR', 'PUBLICADA', 'CERRADA')`,
    );
    await queryRunner.query(
      `ALTER TABLE "boleta" ALTER COLUMN "estado" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "boleta" ALTER COLUMN "estado" TYPE "public"."boleta_estado_enum" USING "estado"::"text"::"public"."boleta_estado_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "boleta" ALTER COLUMN "estado" SET DEFAULT 'BORRADOR'`,
    );
    await queryRunner.query(`DROP TYPE "public"."estado_boleta_enum_old"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_d7715597e9f317cee853a950ea" ON "voto_confirmacion" ("id_eleccion") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_95c2640c58bce2ed15023a254a" ON "refresh_session" ("token_hash") `,
    );
    await queryRunner.query(
      `ALTER TABLE "voto_confirmacion" ADD CONSTRAINT "UQ_e12ee8b13bff67bb9e5b253cc4e" UNIQUE ("id_eleccion", "idempotency_key")`,
    );
    await queryRunner.query(
      `ALTER TABLE "configuracion_comicio" ADD CONSTRAINT "FK_525b656c05c9f6fdf96aea15c8f" FOREIGN KEY ("id_eleccion") REFERENCES "eleccion"("id_eleccion") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "merkle_tree" ADD CONSTRAINT "FK_f9d76d31f75a957141b1f6183f9" FOREIGN KEY ("id_padron") REFERENCES "padron_electoral"("id_padron") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_log" ADD CONSTRAINT "FK_b67a989384fb9cfb136b4acda5d" FOREIGN KEY ("id_eleccion") REFERENCES "eleccion"("id_eleccion") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "campo_datos_candidato" ADD CONSTRAINT "FK_b69648c52c66291243281363e47" FOREIGN KEY ("id_configuracion") REFERENCES "configuracion_datos_candidato"("id_configuracion") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "configuracion_datos_candidato" ADD CONSTRAINT "FK_1a2171698bd6425431d32405517" FOREIGN KEY ("id_eleccion") REFERENCES "eleccion"("id_eleccion") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "lista" ADD CONSTRAINT "FK_bf136916e8cc59d98fc5f3d72da" FOREIGN KEY ("id_boleta") REFERENCES "boleta"("id_boleta") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "boleta" ADD CONSTRAINT "FK_11b364693e6c98cfcb95d8181d3" FOREIGN KEY ("id_eleccion") REFERENCES "eleccion"("id_eleccion") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "categoria" ADD CONSTRAINT "FK_acb6766ff2ad6c738a691465b26" FOREIGN KEY ("id_boleta") REFERENCES "boleta"("id_boleta") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "candidato" ADD CONSTRAINT "FK_eb091be01523fb4adae3d88cbf9" FOREIGN KEY ("id_lista") REFERENCES "lista"("id_lista") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "candidato" ADD CONSTRAINT "FK_2085dae314ddbe71a40240026de" FOREIGN KEY ("id_categoria") REFERENCES "categoria"("id_categoria") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "candidato" DROP CONSTRAINT "FK_2085dae314ddbe71a40240026de"`,
    );
    await queryRunner.query(
      `ALTER TABLE "candidato" DROP CONSTRAINT "FK_eb091be01523fb4adae3d88cbf9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categoria" DROP CONSTRAINT "FK_acb6766ff2ad6c738a691465b26"`,
    );
    await queryRunner.query(
      `ALTER TABLE "boleta" DROP CONSTRAINT "FK_11b364693e6c98cfcb95d8181d3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lista" DROP CONSTRAINT "FK_bf136916e8cc59d98fc5f3d72da"`,
    );
    await queryRunner.query(
      `ALTER TABLE "configuracion_datos_candidato" DROP CONSTRAINT "FK_1a2171698bd6425431d32405517"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campo_datos_candidato" DROP CONSTRAINT "FK_b69648c52c66291243281363e47"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_log" DROP CONSTRAINT "FK_b67a989384fb9cfb136b4acda5d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "merkle_tree" DROP CONSTRAINT "FK_f9d76d31f75a957141b1f6183f9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "configuracion_comicio" DROP CONSTRAINT "FK_525b656c05c9f6fdf96aea15c8f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "voto_confirmacion" DROP CONSTRAINT "UQ_e12ee8b13bff67bb9e5b253cc4e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_95c2640c58bce2ed15023a254a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d7715597e9f317cee853a950ea"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."estado_boleta_enum_old" AS ENUM('BORRADOR', 'PUBLICADA', 'CERRADA')`,
    );
    await queryRunner.query(
      `ALTER TABLE "boleta" ALTER COLUMN "estado" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "boleta" ALTER COLUMN "estado" TYPE "public"."estado_boleta_enum_old" USING "estado"::"text"::"public"."estado_boleta_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "boleta" ALTER COLUMN "estado" SET DEFAULT 'BORRADOR'`,
    );
    await queryRunner.query(`DROP TYPE "public"."boleta_estado_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."estado_boleta_enum_old" RENAME TO "estado_boleta_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."estado_lista_enum_old" AS ENUM('BORRADOR', 'OFICIALIZADA', 'INHABILITADA')`,
    );
    await queryRunner.query(
      `ALTER TABLE "lista" ALTER COLUMN "estado" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "lista" ALTER COLUMN "estado" TYPE "public"."estado_lista_enum_old" USING "estado"::"text"::"public"."estado_lista_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lista" ALTER COLUMN "estado" SET DEFAULT 'BORRADOR'`,
    );
    await queryRunner.query(`DROP TYPE "public"."lista_estado_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."estado_lista_enum_old" RENAME TO "estado_lista_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tipo_campo_candidato_enum_old" AS ENUM('texto', 'numero', 'email', 'url', 'fecha', 'booleano')`,
    );
    await queryRunner.query(
      `ALTER TABLE "campo_datos_candidato" ALTER COLUMN "tipo" TYPE "public"."tipo_campo_candidato_enum_old" USING "tipo"::"text"::"public"."tipo_campo_candidato_enum_old"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."campo_datos_candidato_tipo_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."tipo_campo_candidato_enum_old" RENAME TO "tipo_campo_candidato_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_session" ADD CONSTRAINT "UQ_refresh_session_token_hash" UNIQUE ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tipo_votacion_enum_old" AS ENUM('POR_CANDIDATO', 'POR_LISTA', 'MIXTO')`,
    );
    await queryRunner.query(
      `ALTER TABLE "eleccion" ALTER COLUMN "tipo_votacion" TYPE "public"."tipo_votacion_enum_old" USING "tipo_votacion"::"text"::"public"."tipo_votacion_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."eleccion_tipo_votacion_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."tipo_votacion_enum_old" RENAME TO "tipo_votacion_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."politica_revoto_enum_old" AS ENUM('LAST_VOTE_WINS', 'DISABLED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "configuracion_comicio" ALTER COLUMN "politica_revoto" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "configuracion_comicio" ALTER COLUMN "politica_revoto" TYPE "public"."politica_revoto_enum_old" USING "politica_revoto"::"text"::"public"."politica_revoto_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "configuracion_comicio" ALTER COLUMN "politica_revoto" SET DEFAULT 'DISABLED'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."configuracion_comicio_politica_revoto_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."politica_revoto_enum_old" RENAME TO "politica_revoto_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."metodo_autenticacion_enum_old" AS ENUM('GOOGLE', 'SSO_INSTITUCIONAL')`,
    );
    await queryRunner.query(
      `ALTER TABLE "configuracion_comicio" ALTER COLUMN "metodos_autenticacion" TYPE "public"."metodo_autenticacion_enum_old"[] USING "metodos_autenticacion"::"text"::"public"."metodo_autenticacion_enum_old"[]`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."configuracion_comicio_metodos_autenticacion_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."metodo_autenticacion_enum_old" RENAME TO "metodo_autenticacion_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lista" ADD CONSTRAINT "UQ_lista_boleta_list_id" UNIQUE ("id_boleta", "list_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "lista" ADD CONSTRAINT "UQ_lista_boleta_sigla" UNIQUE ("id_boleta", "sigla")`,
    );
    await queryRunner.query(
      `ALTER TABLE "campo_datos_candidato" ADD CONSTRAINT "UQ_campo_config_orden" UNIQUE ("id_configuracion", "orden")`,
    );
    await queryRunner.query(
      `ALTER TABLE "campo_datos_candidato" ADD CONSTRAINT "UQ_campo_config_clave" UNIQUE ("id_configuracion", "clave")`,
    );
    await queryRunner.query(
      `ALTER TABLE "voto_confirmacion" ADD CONSTRAINT "UQ_voto_confirmacion_eleccion_idempotency" UNIQUE ("id_eleccion", "idempotency_key")`,
    );
    await queryRunner.query(
      `ALTER TABLE "voto_confirmacion" ADD CONSTRAINT "UQ_voto_confirmacion_eleccion_votante" UNIQUE ("id_eleccion", "votante_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_session_identificador_sso" ON "refresh_session" ("identificador_sso") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_voto_confirmacion_tx_hash" ON "voto_confirmacion" ("tx_hash") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_voto_confirmacion_codigo_verificacion_e2e" ON "voto_confirmacion" ("codigo_verificacion_e2e") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_voto_confirmacion_id_eleccion" ON "voto_confirmacion" ("id_eleccion") `,
    );
    await queryRunner.query(
      `ALTER TABLE "candidato" ADD CONSTRAINT "FK_candidato_lista" FOREIGN KEY ("id_lista") REFERENCES "lista"("id_lista") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "candidato" ADD CONSTRAINT "FK_candidato_categoria" FOREIGN KEY ("id_categoria") REFERENCES "categoria"("id_categoria") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "categoria" ADD CONSTRAINT "FK_categoria_boleta" FOREIGN KEY ("id_boleta") REFERENCES "boleta"("id_boleta") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "boleta" ADD CONSTRAINT "FK_boleta_eleccion" FOREIGN KEY ("id_eleccion") REFERENCES "eleccion"("id_eleccion") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "lista" ADD CONSTRAINT "FK_lista_boleta" FOREIGN KEY ("id_boleta") REFERENCES "boleta"("id_boleta") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "configuracion_datos_candidato" ADD CONSTRAINT "FK_config_datos_candidato_eleccion" FOREIGN KEY ("id_eleccion") REFERENCES "eleccion"("id_eleccion") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "campo_datos_candidato" ADD CONSTRAINT "FK_campo_configuracion" FOREIGN KEY ("id_configuracion") REFERENCES "configuracion_datos_candidato"("id_configuracion") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_log" ADD CONSTRAINT "FK_audit_log_eleccion" FOREIGN KEY ("id_eleccion") REFERENCES "eleccion"("id_eleccion") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "merkle_tree" ADD CONSTRAINT "FK_merkle_tree_padron" FOREIGN KEY ("id_padron") REFERENCES "padron_electoral"("id_padron") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "configuracion_comicio" ADD CONSTRAINT "FK_configuracion_comicio_eleccion" FOREIGN KEY ("id_eleccion") REFERENCES "eleccion"("id_eleccion") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "voto_confirmacion" ADD CONSTRAINT "FK_voto_confirmacion_eleccion" FOREIGN KEY ("id_eleccion") REFERENCES "eleccion"("id_eleccion") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * VOTAR-486: borrado lógico de `eleccion`.
 *
 * El DELETE físico de un comicio dispara el `ON DELETE SET NULL` de la FK
 * `audit_log.id_eleccion → eleccion`, y el trigger de inmutabilidad de
 * `audit_log` (VOTAR-372) aborta ese UPDATE. Resultado: cualquier comicio con
 * bitácora asociada (por ejemplo tras cargar el padrón) no se podía eliminar,
 * ni siquiera en BORRADOR.
 *
 * Se agrega `fecha_eliminacion` (columna de soft delete de TypeORM). El servicio
 * pasa a `softRemove`, que solo marca la fila; TypeORM excluye automáticamente
 * los comicios borrados de todas las lecturas.
 */
export class EleccionSoftDelete1787400000000 implements MigrationInterface {
  name = 'EleccionSoftDelete1787400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "eleccion" ADD COLUMN "fecha_eliminacion" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "eleccion" DROP COLUMN "fecha_eliminacion"`,
    );
  }
}

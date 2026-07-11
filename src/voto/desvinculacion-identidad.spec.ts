import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getMetadataArgsStorage } from 'typeorm';
import { AuditLog } from '@/audit/entities/audit-log.entity';
import { AutoridadElectoral } from '@/auth/entities/autoridad-electoral.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { PadronElectoral } from '@/padron/entities/padron-electoral.entity';
import { PadronVotante } from '@/padron/entities/padron-votante.entity';
import { VotoController } from '@/voto/controllers/voto.controller';
import { VotoService } from '@/voto/services/voto.service';

// Side-effect imports so TypeORM metadata is registered for schema assertions.
void [AuditLog, AutoridadElectoral, Eleccion, PadronElectoral, PadronVotante];

/**
 * VOTAR-379 UAT-01 / UAT-02: ausencia de tablas o columnas off-chain que
 * vinculen identidad de votante (votanteHash / voterId) con contenido de
 * voto, nullifier o hash de transacción.
 */
describe('VOTAR-379 desvinculación identidad↔voto (esquema)', () => {
  it('UAT-01: no existe archivo de entidad voto_confirmacion', () => {
    const entityPath = join(
      __dirname,
      'entities',
      'voto-confirmacion.entity.ts',
    );
    expect(existsSync(entityPath)).toBe(false);
  });

  it('UAT-01: no existe entidad TypeORM voto_confirmacion en el metadata cargado', () => {
    const tables = getMetadataArgsStorage().tables.map((table) =>
      typeof table.name === 'string' ? table.name : String(table.name),
    );
    expect(tables).not.toContain('voto_confirmacion');
  });

  it('UAT-01: ninguna columna registrada se llama votante_hash o payload_hash', () => {
    const columnNames = getMetadataArgsStorage().columns.map((column) =>
      String(column.options?.name ?? column.propertyName),
    );
    expect(columnNames).not.toContain('votante_hash');
    expect(columnNames).not.toContain('payload_hash');
  });

  it('UAT-01: el controller y el servicio no exponen confirmación off-chain', () => {
    const controllerProto = VotoController.prototype as Record<string, unknown>;
    const serviceProto = VotoService.prototype as Record<string, unknown>;
    expect(controllerProto.confirmarVoto).toBeUndefined();
    expect(serviceProto.confirmarVoto).toBeUndefined();
    expect(typeof controllerProto.obtenerBoletaDigital).toBe('function');
    expect(typeof controllerProto.solicitarMerkleProof).toBe('function');
  });

  it('UAT-02: no hay relación TypeORM desde entidades de voto hacia padrón/votante', () => {
    const relations = getMetadataArgsStorage().relations;
    const voteIdentityLinks = relations.filter((relation) => {
      const targetName =
        typeof relation.target === 'function'
          ? relation.target.name
          : String(relation.target);
      return /voto|confirmacion/i.test(targetName);
    });
    expect(voteIdentityLinks).toHaveLength(0);
  });
});

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Eleccion } from '../eleccion/entities/eleccion.entity';
import { MerkleTree } from './entities/merkle-tree.entity';
import { PadronElectoral } from './entities/padron-electoral.entity';
import { PadronVotante } from './entities/padron-votante.entity';
import { MerkleTreeEstado } from './enums/merkle-tree-estado.enum';
import { PadronEstado } from './enums/padron-estado.enum';
import {
  CrearPadronInput,
  IPadronRepository,
} from './interfaces/padron.repository.interface';

@Injectable()
export class PadronRepository implements IPadronRepository {
  constructor(
    @InjectRepository(PadronElectoral)
    private readonly padronRepository: Repository<PadronElectoral>,
    @InjectRepository(MerkleTree)
    private readonly merkleTreeRepository: Repository<MerkleTree>,
    @InjectRepository(Eleccion)
    private readonly eleccionRepository: Repository<Eleccion>,
    private readonly dataSource: DataSource,
  ) {}

  buscarEleccionPorId(idEleccion: number): Promise<Eleccion | null> {
    return this.eleccionRepository.findOne({ where: { idEleccion } });
  }

  async existePadronParaEleccion(idEleccion: number): Promise<boolean> {
    const total = await this.padronRepository.count({
      where: { eleccion: { idEleccion } },
    });
    return total > 0;
  }

  obtenerPadronPorEleccion(
    idEleccion: number,
  ): Promise<PadronElectoral | null> {
    return this.padronRepository.findOne({
      where: { eleccion: { idEleccion } },
    });
  }

  obtenerMerklePorEleccion(idEleccion: number): Promise<MerkleTree | null> {
    return this.merkleTreeRepository.findOne({
      where: { padron: { eleccion: { idEleccion } } },
    });
  }

  buscarVotantePorHash(
    idEleccion: number,
    hashHoja: string,
  ): Promise<PadronVotante | null> {
    return this.dataSource.getRepository(PadronVotante).findOne({
      where: {
        hashHoja,
        padron: { eleccion: { idEleccion } },
      },
    });
  }

  listarVotantesPaginado(
    idEleccion: number,
    page: number,
    limit: number,
  ): Promise<[PadronVotante[], number]> {
    return this.dataSource.getRepository(PadronVotante).findAndCount({
      where: { padron: { eleccion: { idEleccion } } },
      order: { indiceHoja: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  /**
   * Elimina el padrón de la elección. Las hojas (PADRON_VOTANTE) se borran en
   * cascada por la FK `id_padron` (onDelete: CASCADE).
   */
  async eliminarPadronPorEleccion(idEleccion: number): Promise<void> {
    await this.padronRepository
      .createQueryBuilder()
      .delete()
      .where('id_eleccion = :idEleccion', { idEleccion })
      .execute();
  }

  /**
   * Persiste el padrón y todas sus hojas dentro de una única transacción.
   * Ante cualquier fallo (incluida la conexión) se revierte la operación completa.
   */
  async crearPadronConVotantes(
    input: CrearPadronInput,
  ): Promise<PadronElectoral> {
    return this.dataSource.transaction(async (manager) => {
      const padron = manager.create(PadronElectoral, {
        eleccion: { idEleccion: input.idEleccion } as Eleccion,
        totalVotantesHabilitados: input.sortedLeaves.length,
        hashPadron: input.hashPadron,
        estado: PadronEstado.BORRADOR,
        totalProcesados: input.totalProcesados,
        totalOmitidos: input.totalOmitidos,
        novedades: input.novedades,
      });
      const padronGuardado = await manager.save(padron);

      const votantes = input.sortedLeaves.map(({ hashHoja, indiceHoja }) =>
        manager.create(PadronVotante, {
          idPadronVotante: randomUUID(),
          padron: padronGuardado,
          indiceHoja,
          hashHoja,
        }),
      );
      await manager.save(votantes);

      const merkleTree = manager.create(MerkleTree, {
        padron: padronGuardado,
        merkleRoot: input.merkleRoot,
        totalHojas: input.sortedLeaves.length,
        version: 1,
        estado: MerkleTreeEstado.GENERADO,
        treeDump: input.merkleTreeDump,
      });
      await manager.save(merkleTree);

      return padronGuardado;
    });
  }

  async actualizarPublicacionMerkle(
    idEleccion: number,
    data: {
      txHashPublicacion: string;
      numeroBloque: number;
      fechaPublicacionOnChain: Date;
      direccionContrato: string;
    },
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const merkle = await manager.findOne(MerkleTree, {
        where: { padron: { eleccion: { idEleccion } } },
        relations: ['padron'],
      });
      if (!merkle) {
        return;
      }
      merkle.estado = MerkleTreeEstado.PUBLICADO_ON_CHAIN;
      merkle.txHashPublicacion = data.txHashPublicacion;
      merkle.numeroBloque = data.numeroBloque;
      merkle.fechaPublicacionOnChain = data.fechaPublicacionOnChain;
      merkle.direccionContrato = data.direccionContrato;
      await manager.save(merkle);

      await manager.update(
        PadronElectoral,
        { idPadron: merkle.padron.idPadron },
        { estado: PadronEstado.PUBLICADO },
      );
    });
  }
}

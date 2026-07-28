import { NovedadPadronDto } from '../dto/novedad-padron.dto';
import { Eleccion } from '../../eleccion/entities/eleccion.entity';
import { MerkleTree } from '../entities/merkle-tree.entity';
import { PadronElectoral } from '../entities/padron-electoral.entity';
import { PadronVotante } from '../entities/padron-votante.entity';
import { MerkleTreeDump } from '../types/merkle-tree-dump.type';

export const PADRON_REPOSITORY = 'PADRON_REPOSITORY';

export interface MerkleLeafInput {
  hashHoja: string;
  indiceHoja: number;
}

export interface CrearPadronInput {
  idEleccion: number;
  hashPadron: string;
  sortedLeaves: MerkleLeafInput[];
  merkleRoot: string;
  merkleTreeDump: MerkleTreeDump;
  totalProcesados: number;
  totalOmitidos: number;
  novedades: NovedadPadronDto[];
}

export interface IPadronRepository {
  buscarEleccionPorId(idEleccion: number): Promise<Eleccion | null>;
  existePadronParaEleccion(idEleccion: number): Promise<boolean>;
  crearPadronConVotantes(input: CrearPadronInput): Promise<PadronElectoral>;
  obtenerPadronPorEleccion(idEleccion: number): Promise<PadronElectoral | null>;
  obtenerMerklePorEleccion(idEleccion: number): Promise<MerkleTree | null>;
  buscarVotantePorHash(
    idEleccion: number,
    hashHoja: string,
  ): Promise<PadronVotante | null>;
  listarVotantesPaginado(
    idEleccion: number,
    page: number,
    limit: number,
  ): Promise<[PadronVotante[], number]>;
  eliminarPadronPorEleccion(idEleccion: number): Promise<void>;
  actualizarPublicacionMerkle(
    idEleccion: number,
    data: {
      txHashPublicacion: string;
      numeroBloque: number;
      fechaPublicacionOnChain: Date;
      direccionContrato: string;
    },
  ): Promise<void>;
}

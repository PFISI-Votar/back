import { Eleccion } from '../../eleccion/entities/eleccion.entity';
import { PadronElectoral } from '../entities/padron-electoral.entity';
import { PadronVotante } from '../entities/padron-votante.entity';

export const PADRON_REPOSITORY = 'PADRON_REPOSITORY';

export interface CrearPadronInput {
  idEleccion: number;
  hashPadron: string;
  hashesHoja: string[];
}

export interface IPadronRepository {
  buscarEleccionPorId(idEleccion: number): Promise<Eleccion | null>;
  existePadronParaEleccion(idEleccion: number): Promise<boolean>;
  crearPadronConVotantes(input: CrearPadronInput): Promise<PadronElectoral>;
  obtenerPadronPorEleccion(idEleccion: number): Promise<PadronElectoral | null>;
  listarVotantesPaginado(
    idEleccion: number,
    page: number,
    limit: number,
  ): Promise<[PadronVotante[], number]>;
  eliminarPadronPorEleccion(idEleccion: number): Promise<void>;
}

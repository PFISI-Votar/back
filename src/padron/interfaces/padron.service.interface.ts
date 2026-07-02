import { ImportarPadronResponseDto } from '../dto/importar-padron-response.dto';
import { ListarVotantesResponseDto } from '../dto/listar-votantes-response.dto';
import { MerkleProofResponseDto } from '../dto/merkle-proof-response.dto';
import { MerkleResumenResponseDto } from '../dto/merkle-resumen-response.dto';
import { PublicarMerkleResponseDto } from '../dto/publicar-merkle-response.dto';
import { PadronResumenResponseDto } from '../dto/padron-resumen-response.dto';
import { ReporteNovedadesResponseDto } from '../dto/reporte-novedades-response.dto';
import { TotalVotantesResponseDto } from '../dto/total-votantes-response.dto';

export interface IPadronService {
  importarPadron(
    idEleccion: number,
    archivo: Express.Multer.File,
  ): Promise<ImportarPadronResponseDto>;
  obtenerResumen(idEleccion: number): Promise<PadronResumenResponseDto>;
  obtenerReporteNovedades(
    idEleccion: number,
  ): Promise<ReporteNovedadesResponseDto>;
  obtenerTotalVotantesPublico(
    idEleccion: number,
  ): Promise<TotalVotantesResponseDto>;
  listarVotantes(
    idEleccion: number,
    page: number,
    limit: number,
  ): Promise<ListarVotantesResponseDto>;
  obtenerMerkle(idEleccion: number): Promise<MerkleResumenResponseDto>;
  publicarMerkleOnChain(idEleccion: number): Promise<PublicarMerkleResponseDto>;
  obtenerProofVotante(
    idEleccion: number,
    hashHoja: string,
  ): Promise<MerkleProofResponseDto>;
  eliminarPadron(idEleccion: number): Promise<void>;
}

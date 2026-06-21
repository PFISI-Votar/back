import { ImportarPadronResponseDto } from '../dto/importar-padron-response.dto';
import { ListarVotantesResponseDto } from '../dto/listar-votantes-response.dto';
import { PadronResumenResponseDto } from '../dto/padron-resumen-response.dto';

export interface IPadronService {
  importarPadron(
    idEleccion: number,
    archivo: Express.Multer.File,
  ): Promise<ImportarPadronResponseDto>;
  obtenerResumen(idEleccion: number): Promise<PadronResumenResponseDto>;
  listarVotantes(
    idEleccion: number,
    page: number,
    limit: number,
  ): Promise<ListarVotantesResponseDto>;
  eliminarPadron(idEleccion: number): Promise<void>;
}

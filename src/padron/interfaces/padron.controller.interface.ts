import { ImportarPadronResponseDto } from '../dto/importar-padron-response.dto';
import { ListarVotantesResponseDto } from '../dto/listar-votantes-response.dto';
import { PaginacionPadronQueryDto } from '../dto/paginacion-padron-query.dto';
import { PadronResumenResponseDto } from '../dto/padron-resumen-response.dto';

export interface IPadronController {
  importarPadron(
    idEleccion: number,
    archivo: Express.Multer.File,
  ): Promise<ImportarPadronResponseDto>;
  obtenerResumen(idEleccion: number): Promise<PadronResumenResponseDto>;
  listarVotantes(
    idEleccion: number,
    query: PaginacionPadronQueryDto,
  ): Promise<ListarVotantesResponseDto>;
  eliminarPadron(idEleccion: number): Promise<void>;
}

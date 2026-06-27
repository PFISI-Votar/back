import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AdminAuth } from '@/auth/decorators/admin-auth.decorator';
import { ImportarPadronResponseDto } from './dto/importar-padron-response.dto';
import { ListarVotantesResponseDto } from './dto/listar-votantes-response.dto';
import { PaginacionPadronQueryDto } from './dto/paginacion-padron-query.dto';
import { PadronResumenResponseDto } from './dto/padron-resumen-response.dto';
import { ReporteNovedadesResponseDto } from './dto/reporte-novedades-response.dto';
import { MerkleProofResponseDto } from './dto/merkle-proof-response.dto';
import { MerkleResumenResponseDto } from './dto/merkle-resumen-response.dto';
import { IPadronController } from './interfaces/padron.controller.interface';
import { PadronService } from './padron.service';

@ApiTags('padron')
@AdminAuth()
@Controller('elecciones/:idEleccion/padron')
export class PadronController implements IPadronController {
  constructor(private readonly padronService: PadronService) {}

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary:
      'Importar el padrón electoral desde un archivo CSV, hasheando cada identidad con Keccak-256. Tolera filas defectuosas e ignora duplicados (preserva la primera aparición), consolidando las omisiones en un registro de novedades (US-331)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({
    status: 201,
    description:
      'Padrón importado (total o parcialmente). Incluye totales y el registro de novedades de las filas omitidas.',
    type: ImportarPadronResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Archivo vacío, sin registros, o sin las columnas requeridas (dni, email)',
  })
  @ApiResponse({ status: 404, description: 'Elección inexistente' })
  @ApiResponse({
    status: 409,
    description: 'La elección ya tiene padrón cargado',
  })
  @ApiResponse({
    status: 422,
    description: 'La elección no está en estado BORRADOR',
  })
  async importarPadron(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @UploadedFile() archivo: Express.Multer.File,
  ): Promise<ImportarPadronResponseDto> {
    return this.padronService.importarPadron(idEleccion, archivo);
  }

  @Get()
  @ApiOperation({
    summary:
      'Obtener el resumen del padrón de un comicio (total, estado, hash, fecha)',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Resumen del padrón',
    type: PadronResumenResponseDto,
  })
  @ApiResponse({ status: 404, description: 'La elección no tiene padrón' })
  async obtenerResumen(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<PadronResumenResponseDto> {
    return this.padronService.obtenerResumen(idEleccion);
  }

  @Get('novedades')
  @ApiOperation({
    summary:
      'Obtener el reporte de novedades persistido de la importación, para re-descargar el archivo de auditoría (US-331)',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Reporte de novedades (totales + filas omitidas)',
    type: ReporteNovedadesResponseDto,
  })
  @ApiResponse({ status: 404, description: 'La elección no tiene padrón' })
  async obtenerReporteNovedades(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<ReporteNovedadesResponseDto> {
    return this.padronService.obtenerReporteNovedades(idEleccion);
  }

  @Get('merkle')
  @ApiOperation({
    summary:
      'Obtener el sello de integridad Merkle del padrón consolidado (VOTAR-334)',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Resumen del árbol Merkle del padrón',
    type: MerkleResumenResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'La elección no tiene padrón consolidado',
  })
  async obtenerMerkle(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<MerkleResumenResponseDto> {
    return this.padronService.obtenerMerkle(idEleccion);
  }

  @Get('votantes/:hashHoja/proof')
  @ApiOperation({
    summary:
      'Obtener la prueba de pertenencia Merkle de una hoja del padrón (auditoría, VOTAR-334)',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiParam({
    name: 'hashHoja',
    type: String,
    description: 'Hash Keccak-256 de la hoja (64 hex, sin 0x)',
  })
  @ApiResponse({
    status: 200,
    description: 'Prueba de pertenencia calculada on-demand',
    type: MerkleProofResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Hoja o árbol Merkle no encontrado',
  })
  async obtenerProofVotante(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Param('hashHoja') hashHoja: string,
  ): Promise<MerkleProofResponseDto> {
    return this.padronService.obtenerProofVotante(idEleccion, hashHoja);
  }

  @Get('votantes')
  @ApiOperation({
    summary:
      'Listar las hojas del padrón (hash Keccak-256 + índice Merkle canónico) de forma paginada, para auditoría',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Página de hojas del padrón',
    type: ListarVotantesResponseDto,
  })
  @ApiResponse({ status: 404, description: 'La elección no tiene padrón' })
  async listarVotantes(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Query() query: PaginacionPadronQueryDto,
  ): Promise<ListarVotantesResponseDto> {
    return this.padronService.listarVotantes(
      idEleccion,
      query.page,
      query.limit,
    );
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Eliminar el padrón de un comicio (sólo mientras la elección está en estado BORRADOR)',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 204, description: 'Padrón eliminado' })
  @ApiResponse({ status: 404, description: 'La elección no tiene padrón' })
  @ApiResponse({
    status: 422,
    description: 'La elección no está en estado BORRADOR',
  })
  async eliminarPadron(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<void> {
    return this.padronService.eliminarPadron(idEleccion);
  }
}

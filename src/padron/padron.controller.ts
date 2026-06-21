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
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ImportarPadronResponseDto } from './dto/importar-padron-response.dto';
import { ListarVotantesResponseDto } from './dto/listar-votantes-response.dto';
import { PaginacionPadronQueryDto } from './dto/paginacion-padron-query.dto';
import { PadronResumenResponseDto } from './dto/padron-resumen-response.dto';
import { IPadronController } from './interfaces/padron.controller.interface';
import { PadronService } from './padron.service';

@ApiTags('padron')
@ApiBearerAuth()
@Controller('elecciones/:idEleccion/padron')
export class PadronController implements IPadronController {
  constructor(private readonly padronService: PadronService) {}

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary:
      'Importar el padrón electoral desde un archivo CSV, hasheando cada identidad con Keccak-256 (US-330)',
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
    description: 'Padrón importado correctamente',
    type: ImportarPadronResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Archivo o formato CSV inválido' })
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

  @Get('votantes')
  @ApiOperation({
    summary:
      'Listar las hojas del padrón (hash Keccak-256 + índice) de forma paginada, para auditoría',
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

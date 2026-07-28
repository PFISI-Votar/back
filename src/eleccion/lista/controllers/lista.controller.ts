import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AdminAuth } from '@/auth/decorators/admin-auth.decorator';
import { CreateListaDto, UpdateListaDto } from '@/eleccion/lista/dto/lista.dto';
import {
  ListaMapeoItemDto,
  ListaResponseDto,
  OficializarResponseDto,
} from '@/eleccion/lista/dto/lista-response.dto';
import { ListaService } from '@/eleccion/lista/services/lista.service';
import { OficializacionService } from '@/eleccion/lista/services/oficializacion.service';
import { MinimoCandidatosViolationResponseDto } from '@/eleccion/rules-engine/dto/minimo-candidatos-violation.dto';

@ApiTags('listas')
@AdminAuth()
@Controller()
export class ListaController {
  constructor(
    private readonly listaService: ListaService,
    private readonly oficializacionService: OficializacionService,
  ) {}

  @Post('elecciones/:idEleccion/listas')
  @ApiOperation({ summary: 'Crear lista electoral' })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 201, description: 'Created', type: ListaResponseDto })
  @ApiResponse({ status: 404, description: 'Not Found' })
  @ApiResponse({ status: 409, description: 'Conflict — comicio oficializado' })
  async crearLista(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Body() dto: CreateListaDto,
  ): Promise<ListaResponseDto> {
    return this.listaService.create(idEleccion, dto);
  }

  @Get('elecciones/:idEleccion/listas')
  @ApiOperation({ summary: 'Listar listas de un comicio' })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, description: 'OK', type: [ListaResponseDto] })
  @ApiResponse({ status: 404, description: 'Not Found' })
  async listarListas(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<ListaResponseDto[]> {
    return this.listaService.findAllByEleccion(idEleccion);
  }

  @Patch('listas/:idLista')
  @ApiOperation({ summary: 'Actualizar lista electoral' })
  @ApiParam({ name: 'idLista', type: Number })
  @ApiResponse({ status: 200, description: 'OK', type: ListaResponseDto })
  @ApiResponse({ status: 404, description: 'Not Found' })
  @ApiResponse({ status: 409, description: 'Conflict — comicio oficializado' })
  async actualizarLista(
    @Param('idLista', ParseIntPipe) idLista: number,
    @Body() dto: UpdateListaDto,
  ): Promise<ListaResponseDto> {
    return this.listaService.update(idLista, dto);
  }

  @Patch('listas/:idLista/logo')
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Subir o reemplazar logotipo de lista' })
  @ApiParam({ name: 'idLista', type: Number })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { logo: { type: 'string', format: 'binary' } },
      required: ['logo'],
    },
  })
  @ApiResponse({ status: 200, description: 'OK', type: ListaResponseDto })
  @ApiResponse({ status: 400, description: 'Bad Request — imagen inválida' })
  @ApiResponse({ status: 404, description: 'Not Found' })
  @ApiResponse({ status: 409, description: 'Conflict — comicio oficializado' })
  async subirLogoLista(
    @Param('idLista', ParseIntPipe) idLista: number,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ListaResponseDto> {
    return this.listaService.updateLogo(idLista, file);
  }

  @Delete('listas/:idLista/logo')
  @ApiOperation({ summary: 'Eliminar logotipo de lista' })
  @ApiParam({ name: 'idLista', type: Number })
  @ApiResponse({ status: 200, description: 'OK', type: ListaResponseDto })
  @ApiResponse({ status: 404, description: 'Not Found' })
  @ApiResponse({ status: 409, description: 'Conflict — comicio oficializado' })
  async eliminarLogoLista(
    @Param('idLista', ParseIntPipe) idLista: number,
  ): Promise<ListaResponseDto> {
    return this.listaService.removeLogo(idLista);
  }

  @Delete('listas/:idLista')
  @ApiOperation({ summary: 'Eliminar lista electoral' })
  @ApiParam({ name: 'idLista', type: Number })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 404, description: 'Not Found' })
  @ApiResponse({ status: 409, description: 'Conflict — comicio oficializado' })
  async eliminarLista(
    @Param('idLista', ParseIntPipe) idLista: number,
  ): Promise<{ message: string }> {
    await this.listaService.remove(idLista);
    return { message: 'Lista eliminada correctamente' };
  }

  @Post('elecciones/:idEleccion/oficializar')
  @ApiOperation({ summary: 'Oficializar oferta electoral del comicio' })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({
    status: 201,
    description: 'Created',
    type: OficializarResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found' })
  @ApiResponse({ status: 409, description: 'Conflict — ya oficializado' })
  @ApiResponse({
    status: 422,
    description:
      'Unprocessable Entity — padrón electoral no cargado, sin listas válidas, categorías incompletas o candidatos insuficientes',
    type: MinimoCandidatosViolationResponseDto,
  })
  async oficializar(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<OficializarResponseDto> {
    return this.oficializacionService.oficializar(idEleccion);
  }

  @Get('elecciones/:idEleccion/listas/mapeo')
  @ApiOperation({
    summary: 'Obtener mapeo estático list_id post-oficialización',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, description: 'OK', type: [ListaMapeoItemDto] })
  @ApiResponse({ status: 404, description: 'Not Found' })
  @ApiResponse({
    status: 422,
    description: 'Unprocessable Entity — no oficializado',
  })
  async obtenerMapeo(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<ListaMapeoItemDto[]> {
    return this.oficializacionService.obtenerMapeo(idEleccion);
  }
}

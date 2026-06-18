import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CandidatoService } from './candidato.service';
import { ConfiguracionDatosCandidatoService } from './configuracion-datos-candidato.service';
import { CreateCandidatoDto, UpdateCandidatoDto } from './dto/candidato.dto';
import {
  ConfiguracionDatosCandidatoResponseDto,
  GuardarConfiguracionDatosCandidatoDto,
} from './dto/configuracion-datos-candidato.dto';
import { CreateListaDto, UpdateListaDto } from './dto/lista.dto';
import {
  CandidatoResponseDto,
  ListaMapeoItemDto,
  ListaResponseDto,
  OficializarResponseDto,
} from './dto/lista-response.dto';
import { ListaService } from './lista.service';
import { OficializacionService } from './oficializacion.service';
import { Eleccion } from './entities/eleccion.entity';
import { EleccionesService } from './eleccion.service';

@ApiTags('listas')
@Controller()
export class ListaController {
  constructor(
    private readonly listaService: ListaService,
    private readonly candidatoService: CandidatoService,
    private readonly oficializacionService: OficializacionService,
    private readonly eleccionesService: EleccionesService,
    private readonly configuracionDatosCandidatoService: ConfiguracionDatosCandidatoService,
  ) {}

  @Get('elecciones/:idEleccion')
  @ApiOperation({ summary: 'Obtener comicio por ID' })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, description: 'OK', type: Eleccion })
  @ApiResponse({ status: 404, description: 'Not Found' })
  async obtenerEleccion(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<Eleccion> {
    return this.eleccionesService.obtenerPorId(idEleccion);
  }

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

  @Post('listas/:idLista/candidatos')
  @ApiOperation({ summary: 'Agregar candidato a una lista' })
  @ApiParam({ name: 'idLista', type: Number })
  @ApiResponse({ status: 201, description: 'Created', type: CandidatoResponseDto })
  @ApiResponse({ status: 404, description: 'Not Found' })
  @ApiResponse({ status: 409, description: 'Conflict — comicio oficializado' })
  @ApiResponse({ status: 422, description: 'Unprocessable Entity — datos adicionales inválidos' })
  async crearCandidato(
    @Param('idLista', ParseIntPipe) idLista: number,
    @Body() dto: CreateCandidatoDto,
  ): Promise<CandidatoResponseDto> {
    return this.candidatoService.create(idLista, dto);
  }

  @Get('listas/:idLista/candidatos')
  @ApiOperation({ summary: 'Listar candidatos de una lista' })
  @ApiParam({ name: 'idLista', type: Number })
  @ApiResponse({ status: 200, description: 'OK', type: [CandidatoResponseDto] })
  @ApiResponse({ status: 404, description: 'Not Found' })
  async listarCandidatos(
    @Param('idLista', ParseIntPipe) idLista: number,
  ): Promise<CandidatoResponseDto[]> {
    return this.candidatoService.findAllByLista(idLista);
  }

  @Patch('candidatos/:idCandidato')
  @ApiOperation({ summary: 'Actualizar ficha de candidato' })
  @ApiParam({ name: 'idCandidato', type: Number })
  @ApiResponse({ status: 200, description: 'OK', type: CandidatoResponseDto })
  @ApiResponse({ status: 404, description: 'Not Found' })
  @ApiResponse({ status: 409, description: 'Conflict — comicio oficializado' })
  @ApiResponse({ status: 422, description: 'Unprocessable Entity — datos adicionales inválidos' })
  async actualizarCandidato(
    @Param('idCandidato', ParseIntPipe) idCandidato: number,
    @Body() dto: UpdateCandidatoDto,
  ): Promise<CandidatoResponseDto> {
    return this.candidatoService.update(idCandidato, dto);
  }

  @Delete('candidatos/:idCandidato')
  @ApiOperation({ summary: 'Eliminar candidato' })
  @ApiParam({ name: 'idCandidato', type: Number })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 404, description: 'Not Found' })
  @ApiResponse({ status: 409, description: 'Conflict — comicio oficializado' })
  async eliminarCandidato(
    @Param('idCandidato', ParseIntPipe) idCandidato: number,
  ): Promise<{ message: string }> {
    await this.candidatoService.remove(idCandidato);
    return { message: 'Candidato eliminado correctamente' };
  }

  @Post('elecciones/:idEleccion/oficializar')
  @ApiOperation({ summary: 'Oficializar oferta electoral del comicio' })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 201, description: 'Created', type: OficializarResponseDto })
  @ApiResponse({ status: 404, description: 'Not Found' })
  @ApiResponse({ status: 409, description: 'Conflict — ya oficializado' })
  @ApiResponse({ status: 422, description: 'Unprocessable Entity — sin listas válidas' })
  async oficializar(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<OficializarResponseDto> {
    return this.oficializacionService.oficializar(idEleccion);
  }

  @Get('elecciones/:idEleccion/listas/mapeo')
  @ApiOperation({ summary: 'Obtener mapeo estático list_id post-oficialización' })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, description: 'OK', type: [ListaMapeoItemDto] })
  @ApiResponse({ status: 404, description: 'Not Found' })
  @ApiResponse({ status: 422, description: 'Unprocessable Entity — no oficializado' })
  async obtenerMapeo(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<ListaMapeoItemDto[]> {
    return this.oficializacionService.obtenerMapeo(idEleccion);
  }

  @Get('elecciones/:idEleccion/configuracion-datos-candidato')
  @ApiOperation({ summary: 'Obtener configuración de datos adicionales de candidatos' })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, type: ConfiguracionDatosCandidatoResponseDto })
  @ApiResponse({ status: 404, description: 'Not Found' })
  async obtenerConfiguracionDatosCandidato(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<ConfiguracionDatosCandidatoResponseDto> {
    return this.configuracionDatosCandidatoService.obtenerPorEleccion(idEleccion);
  }

  @Put('elecciones/:idEleccion/configuracion-datos-candidato')
  @ApiOperation({ summary: 'Guardar configuración de datos adicionales de candidatos' })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, type: ConfiguracionDatosCandidatoResponseDto })
  @ApiResponse({ status: 404, description: 'Not Found' })
  @ApiResponse({ status: 409, description: 'Conflict — configuración bloqueada o comicio oficializado' })
  @ApiResponse({ status: 422, description: 'Unprocessable Entity — definición inválida' })
  async guardarConfiguracionDatosCandidato(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Body() dto: GuardarConfiguracionDatosCandidatoDto,
  ): Promise<ConfiguracionDatosCandidatoResponseDto> {
    return this.configuracionDatosCandidatoService.guardar(idEleccion, dto);
  }
}

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
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CandidatoService } from '@/eleccion/candidato/services/candidato.service';
import { ConfiguracionDatosCandidatoService } from '@/eleccion/candidato/services/configuracion-datos-candidato.service';
import {
  CreateCandidatoDto,
  UpdateCandidatoDto,
} from '@/eleccion/candidato/dto/candidato.dto';
import { CandidatoResponseDto } from '@/eleccion/candidato/dto/candidato-response.dto';
import {
  ConfiguracionDatosCandidatoResponseDto,
  GuardarConfiguracionDatosCandidatoDto,
} from '@/eleccion/candidato/dto/configuracion-datos-candidato.dto';

@ApiTags('candidatos')
@Controller()
export class CandidatoController {
  constructor(
    private readonly candidatoService: CandidatoService,
    private readonly configuracionDatosCandidatoService: ConfiguracionDatosCandidatoService,
  ) {}

  @Post('listas/:idLista/candidatos')
  @ApiOperation({ summary: 'Agregar candidato a una lista' })
  @ApiParam({ name: 'idLista', type: Number })
  @ApiResponse({
    status: 201,
    description: 'Created',
    type: CandidatoResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found' })
  @ApiResponse({ status: 409, description: 'Conflict — comicio oficializado' })
  @ApiResponse({
    status: 422,
    description: 'Unprocessable Entity — datos adicionales inválidos',
  })
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
  @ApiResponse({
    status: 422,
    description: 'Unprocessable Entity — datos adicionales inválidos',
  })
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

  @Get('elecciones/:idEleccion/configuracion-datos-candidato')
  @ApiOperation({
    summary: 'Obtener configuración de datos adicionales de candidatos',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, type: ConfiguracionDatosCandidatoResponseDto })
  @ApiResponse({ status: 404, description: 'Not Found' })
  async obtenerConfiguracionDatosCandidato(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<ConfiguracionDatosCandidatoResponseDto> {
    return this.configuracionDatosCandidatoService.obtenerPorEleccion(
      idEleccion,
    );
  }

  @Put('elecciones/:idEleccion/configuracion-datos-candidato')
  @ApiOperation({
    summary: 'Guardar configuración de datos adicionales de candidatos',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, type: ConfiguracionDatosCandidatoResponseDto })
  @ApiResponse({ status: 404, description: 'Not Found' })
  @ApiResponse({
    status: 409,
    description: 'Conflict — configuración bloqueada o comicio oficializado',
  })
  @ApiResponse({
    status: 422,
    description: 'Unprocessable Entity — definición inválida',
  })
  async guardarConfiguracionDatosCandidato(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Body() dto: GuardarConfiguracionDatosCandidatoDto,
  ): Promise<ConfiguracionDatosCandidatoResponseDto> {
    return this.configuracionDatosCandidatoService.guardar(idEleccion, dto);
  }
}

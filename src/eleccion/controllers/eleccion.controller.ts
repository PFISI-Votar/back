import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AdminAuth } from '@/auth/decorators/admin-auth.decorator';
import { ActualizarEleccionDto } from '@/eleccion/dto/actualizar-eleccion.dto';
import { CrearEleccionDto } from '@/eleccion/dto/crear-eleccion.dto';
import { EleccionResponseDto } from '@/eleccion/dto/eleccion-response.dto';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { IEleccionController } from '@/eleccion/interfaces/eleccion.controller.interface';
import { EleccionesService } from '@/eleccion/services/eleccion.service';
import { AperturaComicioService } from '@/eleccion/services/apertura-comicio.service';
import { CierreComicioService } from '@/eleccion/services/cierre-comicio.service';
import { ArchivarComicioService } from '@/eleccion/services/archivar-comicio.service';
import type { AuthenticatedRequest } from '@/auth/interfaces/authenticated-request.interface';
import { assertAuthenticatedUser } from '@/auth/strategies/jwt.strategy';

@ApiTags('elecciones')
@AdminAuth()
@Controller('elecciones')
export class EleccionesController implements IEleccionController {
  constructor(
    private readonly eleccionesService: EleccionesService,
    private readonly aperturaComicioService: AperturaComicioService,
    private readonly cierreComicioService: CierreComicioService,
    private readonly archivarComicioService: ArchivarComicioService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar comicios',
    description:
      'Sin filtro devuelve el panel de gestión activa (excluye ARCHIVADA). Con estado=ARCHIVADA devuelve la pestaña Históricos (VOTAR-322).',
  })
  @ApiQuery({ name: 'estado', enum: EleccionEstado, required: false })
  @ApiResponse({ status: 200, description: 'OK', type: [EleccionResponseDto] })
  async listarElecciones(
    @Query('estado') estado?: EleccionEstado,
  ): Promise<EleccionResponseDto[]> {
    return this.eleccionesService.listarElecciones(estado);
  }

  @Get(':idEleccion')
  @ApiOperation({ summary: 'Obtener comicio por ID' })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, description: 'OK', type: EleccionResponseDto })
  @ApiResponse({ status: 404, description: 'Not Found' })
  async obtenerEleccion(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<EleccionResponseDto> {
    return this.eleccionesService.obtenerPorId(idEleccion);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo comicio en estado BORRADOR' })
  @ApiResponse({
    status: 201,
    description: 'Comicio creado exitosamente',
    type: EleccionResponseDto,
  })
  @ApiResponse({
    status: 422,
    description:
      'Validación de fechas (pasado u orden), roles o métodos de autenticación',
  })
  @ApiResponse({
    status: 400,
    description: 'Datos inválidos o campo mal formado',
  })
  async crearEleccion(
    @Body() dto: CrearEleccionDto,
  ): Promise<EleccionResponseDto> {
    return this.eleccionesService.crearEleccion(dto);
  }

  @Patch(':idEleccion')
  @ApiOperation({ summary: 'Actualizar comicio en estado BORRADOR' })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 200, description: 'OK', type: EleccionResponseDto })
  @ApiResponse({ status: 404, description: 'Not Found' })
  @ApiResponse({ status: 409, description: 'Comicio no editable' })
  @ApiResponse({ status: 422, description: 'Validación fallida' })
  async actualizarEleccion(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Body() dto: ActualizarEleccionDto,
  ): Promise<EleccionResponseDto> {
    return this.eleccionesService.actualizarEleccion(idEleccion, dto);
  }

  @Delete(':idEleccion')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar comicio en estado BORRADOR' })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({ status: 204, description: 'Eliminado' })
  @ApiResponse({ status: 404, description: 'Not Found' })
  @ApiResponse({ status: 409, description: 'Comicio no editable' })
  async eliminarEleccion(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<void> {
    return this.eleccionesService.eliminarEleccion(idEleccion);
  }

  @Post(':idEleccion/abrir')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Abrir comicio manualmente (VOTAR-320)',
    description:
      'Valida precondiciones (estado CONFIGURADA, padrón cargado, Merkle PUBLICADO_ON_CHAIN y verificación on-chain) y transiciona el comicio al estado ABIERTA. Sincroniza el estado con el Smart Contract.',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Comicio abierto exitosamente',
    type: EleccionResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Comicio no encontrado' })
  @ApiResponse({
    status: 412,
    description:
      'Fallo de Precondición: padrón no cargado, Merkle no publicado on-chain, o raíz de Merkle no detectada en la red descentralizada',
  })
  @ApiResponse({
    status: 422,
    description: 'Comicio no está en estado CONFIGURADA',
  })
  @ApiResponse({
    status: 503,
    description:
      'La sincronización on-chain falló (Smart Contract no accesible o cuenta sin permisos)',
  })
  async abrirComicio(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<EleccionResponseDto> {
    const user = assertAuthenticatedUser(req.user);
    await this.aperturaComicioService.abrirManual(
      idEleccion,
      user.sub,
      this.resolveClientIp(req),
    );
    return this.eleccionesService.obtenerPorId(idEleccion);
  }

  @Post(':idEleccion/cerrar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cerrar comicio manualmente (VOTAR-321)',
    description:
      'Transiciona el comicio ABIERTA → CERRADA, sincroniza CLOSED on-chain, congela el snapshot del dashboard público y bloquea nuevos sufragios (HTTP 410).',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Comicio cerrado exitosamente',
    type: EleccionResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Comicio no encontrado' })
  @ApiResponse({
    status: 422,
    description: 'Comicio no está en estado ABIERTA',
  })
  @ApiResponse({
    status: 503,
    description:
      'La sincronización on-chain falló (Smart Contract no accesible o cuenta sin permisos)',
  })
  async cerrarComicio(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<EleccionResponseDto> {
    const user = assertAuthenticatedUser(req.user);
    await this.cierreComicioService.cerrarManual(
      idEleccion,
      user.sub,
      this.resolveClientIp(req),
    );
    return this.eleccionesService.obtenerPorId(idEleccion);
  }

  @Post(':idEleccion/archivar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Archivar comicio cerrado (VOTAR-322)',
    description:
      'Transiciona el comicio CERRADA → ARCHIVADA. Operación estrictamente local: no realiza ninguna transacción ni interacción con la red Ethereum Sepolia. Remueve el comicio del panel de gestión activa; los endpoints públicos del Portal de Transparencia siguen sirviendo la evidencia on-chain sin cambios.',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Comicio archivado exitosamente',
    type: EleccionResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Comicio no encontrado' })
  @ApiResponse({
    status: 422,
    description: 'Comicio no está en estado CERRADA',
  })
  async archivarComicio(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<EleccionResponseDto> {
    const user = assertAuthenticatedUser(req.user);
    await this.archivarComicioService.archivarManual(
      idEleccion,
      user.sub,
      this.resolveClientIp(req),
    );
    return this.eleccionesService.obtenerPorId(idEleccion);
  }

  private resolveClientIp(request: AuthenticatedRequest): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0]?.trim() ?? 'unknown';
    }
    return request.ip ?? 'unknown';
  }
}

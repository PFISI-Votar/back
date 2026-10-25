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
import { PauserAuth } from '@/auth/decorators/pauser-auth.decorator';
import { ActaAperturaResponseDto } from '@/eleccion/dto/acta-apertura-response.dto';
import { ActaCierreResponseDto } from '@/eleccion/dto/acta-cierre-response.dto';
import { ActualizarEleccionDto } from '@/eleccion/dto/actualizar-eleccion.dto';
import { CrearEleccionDto } from '@/eleccion/dto/crear-eleccion.dto';
import { EleccionResponseDto } from '@/eleccion/dto/eleccion-response.dto';
import { EleccionEstado } from '@/eleccion/enums/eleccion-estado.enum';
import { IEleccionController } from '@/eleccion/interfaces/eleccion.controller.interface';
import { RegistrarHashActaCierreDto } from '@/eleccion/dto/registrar-hash-acta-cierre.dto';
import { RegistrarHashActaCierreResponseDto } from '@/eleccion/dto/registrar-hash-acta-cierre-response.dto';
import { EleccionesService } from '@/eleccion/services/eleccion.service';
import { ActaAperturaService } from '@/eleccion/services/acta-apertura.service';
import { ActaCierreService } from '@/eleccion/services/acta-cierre.service';
import { AperturaComicioService } from '@/eleccion/services/apertura-comicio.service';
import { CierreComicioService } from '@/eleccion/services/cierre-comicio.service';
import { PausaComicioService } from '@/eleccion/pausa/services/pausa-comicio.service';
import { PausarComicioDto } from '@/eleccion/pausa/dto/pausar-comicio.dto';
import { ReanudarComicioDto } from '@/eleccion/pausa/dto/reanudar-comicio.dto';
import { EstadoSolicitudPausaResponseDto } from '@/eleccion/pausa/dto/estado-solicitud-pausa-response.dto';
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
    private readonly pausaComicioService: PausaComicioService,
    private readonly archivarComicioService: ArchivarComicioService,
    private readonly actaAperturaService: ActaAperturaService,
    private readonly actaCierreService: ActaCierreService,
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

  @Get(':idEleccion/acta-apertura')
  @ApiOperation({
    summary: 'Compilar el Acta de Apertura del comicio (VOTAR-374)',
    description:
      'Consolida el volumen de votantes del padrón, los candidatos postulados, ' +
      'la raíz de Merkle anclada y la dirección del Smart Contract. El PDF ' +
      'institucional se genera client-side a partir de esta respuesta.',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({
    status: 200,
    description: 'OK',
    type: ActaAperturaResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Comicio no encontrado' })
  @ApiResponse({
    status: 422,
    description:
      'El comicio aún no fue abierto (estado BORRADOR o CONFIGURADA)',
  })
  async obtenerActaApertura(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<ActaAperturaResponseDto> {
    return this.actaAperturaService.generar(idEleccion);
  }

  @Get(':idEleccion/acta-cierre')
  @ApiOperation({
    summary: 'Compilar el Acta de Cierre del comicio (escrutinio final)',
    description:
      'Consolida los totales de participación, votos por candidato ' +
      '(agrupables por lista en el frontend), blancos, nulos y la ' +
      'dirección del Smart Contract. El PDF institucional se genera ' +
      'client-side a partir de esta respuesta.',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({
    status: 200,
    description: 'OK',
    type: ActaCierreResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Comicio no encontrado' })
  @ApiResponse({
    status: 422,
    description:
      'El comicio aún no fue cerrado (estado BORRADOR, CONFIGURADA o ABIERTA)',
  })
  async obtenerActaCierre(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<ActaCierreResponseDto> {
    return this.actaCierreService.generar(idEleccion);
  }

  @Post(':idEleccion/acta-cierre/hash')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Registrar el hash SHA-256 del Acta de Cierre emitida',
    description:
      'El PDF se genera y hashea client-side; este endpoint deja registro ' +
      'permanente e inmutable del hash en la bitácora de auditoría, para ' +
      'verificar la integridad del documento emitido (UAT-01).',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({
    status: 201,
    description: 'Hash registrado en la bitácora de auditoría',
    type: RegistrarHashActaCierreResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Comicio no encontrado' })
  @ApiResponse({
    status: 422,
    description:
      'El comicio aún no fue cerrado (estado BORRADOR, CONFIGURADA o ABIERTA)',
  })
  async registrarHashActaCierre(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Body() dto: RegistrarHashActaCierreDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<RegistrarHashActaCierreResponseDto> {
    const user = assertAuthenticatedUser(req.user);
    return this.actaCierreService.registrarHash({
      idEleccion,
      actorId: user.sub,
      hashPdf: dto.hashPdf,
      timestamp: new Date(),
      ipOrigen: this.resolveClientIp(req),
    });
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

  @Post(':idEleccion/pausar')
  @PauserAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Solicitar/confirmar la pausa de emergencia del comicio (VOTAR-347)',
    description:
      'Requiere rol PAUSER. La primera autoridad crea la solicitud y queda confirmada automáticamente; ' +
      'se ejecuta on-chain (pause(reason) en BallotContract + VoteRegistry) recién cuando PAUSE_CONFIRMATIONS_REQUIRED ' +
      'autoridades PAUSER distintas confirmaron. Ninguna cuenta individual puede pausar en solitario.',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({
    status: 200,
    description:
      'Confirmación registrada (y ejecutada on-chain si se alcanzó el umbral)',
    type: EstadoSolicitudPausaResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Comicio no encontrado' })
  @ApiResponse({
    status: 409,
    description: 'Ya confirmaste esta solicitud, o hay una operación en curso',
  })
  @ApiResponse({
    status: 422,
    description: 'El comicio no está ABIERTA, o ya está pausado',
  })
  async pausarComicio(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Body() dto: PausarComicioDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<EstadoSolicitudPausaResponseDto> {
    const user = assertAuthenticatedUser(req.user);
    return this.pausaComicioService.solicitarPausa(
      idEleccion,
      user.sub,
      dto.razon,
      this.resolveClientIp(req),
    );
  }

  @Post(':idEleccion/reanudar')
  @PauserAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Solicitar/confirmar la reanudación del comicio pausado (VOTAR-347)',
    description:
      'Mismo esquema de confirmación de PAUSE_CONFIRMATIONS_REQUIRED autoridades PAUSER distintas que /pausar.',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({
    status: 200,
    description:
      'Confirmación registrada (y ejecutada on-chain si se alcanzó el umbral)',
    type: EstadoSolicitudPausaResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Comicio no encontrado' })
  @ApiResponse({
    status: 409,
    description: 'Ya confirmaste esta solicitud, o hay una operación en curso',
  })
  @ApiResponse({ status: 422, description: 'El comicio no está pausado' })
  async reanudarComicio(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
    @Body() dto: ReanudarComicioDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<EstadoSolicitudPausaResponseDto> {
    const user = assertAuthenticatedUser(req.user);
    return this.pausaComicioService.solicitarReanudacion(
      idEleccion,
      user.sub,
      dto.razon,
      this.resolveClientIp(req),
    );
  }

  @Get(':idEleccion/pausar/estado')
  @ApiOperation({
    summary:
      'Estado de la solicitud de pausa/reanudación pendiente (VOTAR-347)',
    description:
      'Devuelve null si no hay ninguna solicitud PENDIENTE para el comicio.',
  })
  @ApiParam({ name: 'idEleccion', type: Number })
  @ApiResponse({
    status: 200,
    description: 'OK',
    type: EstadoSolicitudPausaResponseDto,
  })
  async estadoPausa(
    @Param('idEleccion', ParseIntPipe) idEleccion: number,
  ): Promise<EstadoSolicitudPausaResponseDto | null> {
    return this.pausaComicioService.obtenerEstadoPendiente(idEleccion);
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

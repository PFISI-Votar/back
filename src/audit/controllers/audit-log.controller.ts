import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminAuth } from '@/auth/decorators/admin-auth.decorator';
import { AuditLogListResponseDto } from '@/audit/dto/audit-log-list-response.dto';
import { AuditLogSearchQueryDto } from '@/audit/dto/audit-log-search-query.dto';
import { NivelEventoAudit } from '@/audit/enums/nivel-evento-audit.enum';
import { ResultadoEventoAudit } from '@/audit/enums/resultado-evento-audit.enum';
import { TipoEventoAudit } from '@/audit/enums/tipo-evento-audit.enum';
import { AuditLogQueryService } from '@/audit/services/audit-log-query.service';

@ApiTags('audit-log')
@AdminAuth()
@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly auditLogQueryService: AuditLogQueryService) {}

  @Get()
  @ApiOperation({
    summary:
      'Buscar entradas del registro de auditoría institucional con filtros avanzados (VOTAR-371)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'idEleccion', required: false, type: Number })
  @ApiQuery({
    name: 'tipoEvento',
    required: false,
    enum: TipoEventoAudit,
    isArray: true,
  })
  @ApiQuery({ name: 'actor', required: false, type: String })
  @ApiQuery({ name: 'terminal', required: false, type: String })
  @ApiQuery({ name: 'endpoint', required: false, type: String })
  @ApiQuery({ name: 'desde', required: false, type: String })
  @ApiQuery({ name: 'hasta', required: false, type: String })
  @ApiQuery({ name: 'nivel', required: false, enum: NivelEventoAudit })
  @ApiQuery({ name: 'resultado', required: false, enum: ResultadoEventoAudit })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'Página de entradas de auditoría',
    type: AuditLogListResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 422, description: 'Rango temporal inválido' })
  async consultarAuditLog(
    @Query() query: AuditLogSearchQueryDto,
  ): Promise<AuditLogListResponseDto> {
    return this.auditLogQueryService.consultarAuditLog(query);
  }
}

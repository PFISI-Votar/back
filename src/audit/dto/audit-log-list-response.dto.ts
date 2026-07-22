import { ApiProperty } from '@nestjs/swagger';
import { AuditLogItemResponseDto } from '@/audit/dto/audit-log-item-response.dto';

/** Página de resultados de búsqueda sobre audit_log. */
export class AuditLogListResponseDto {
  @ApiProperty({ type: [AuditLogItemResponseDto] })
  items: AuditLogItemResponseDto[];

  @ApiProperty({
    example: 150,
    description: 'Total de entradas que coinciden con los filtros',
  })
  total: number;

  @ApiProperty({ example: 1, description: 'Página actual (1-based)' })
  page: number;

  @ApiProperty({ example: 50, description: 'Tamaño de página' })
  limit: number;
}

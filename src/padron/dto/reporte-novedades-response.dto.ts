import { ApiProperty } from '@nestjs/swagger';
import { NovedadPadronDto } from './novedad-padron.dto';

/**
 * Reporte de novedades persistido de la importación del padrón, para
 * re-descarga del archivo de auditoría (US-331). No contiene PII.
 */
export class ReporteNovedadesResponseDto {
  @ApiProperty({ example: 42 })
  idEleccion: number;

  @ApiProperty({ example: 105, description: 'Filas de datos leídas del CSV' })
  totalProcesados: number;

  @ApiProperty({ example: 100, description: 'Identidades únicas importadas' })
  totalImportados: number;

  @ApiProperty({
    example: 5,
    description: 'Filas omitidas (defectuosas o duplicadas)',
  })
  totalOmitidos: number;

  @ApiProperty({ type: [NovedadPadronDto] })
  novedades: NovedadPadronDto[];
}

import { ApiProperty } from '@nestjs/swagger';
import { PadronVotanteResponseDto } from './padron-votante-response.dto';

/** Página de hojas del padrón (hashes), para la tabla de auditoría. */
export class ListarVotantesResponseDto {
  @ApiProperty({ type: [PadronVotanteResponseDto] })
  items: PadronVotanteResponseDto[];

  @ApiProperty({ example: 1000, description: 'Total de hojas del padrón' })
  total: number;

  @ApiProperty({ example: 1, description: 'Página actual (1-based)' })
  page: number;

  @ApiProperty({ example: 50, description: 'Tamaño de página' })
  limit: number;
}

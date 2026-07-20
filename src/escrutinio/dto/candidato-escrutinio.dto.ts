import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CandidatoEscrutinioDto {
  @ApiProperty({ example: 1 })
  idCandidato: number;

  @ApiProperty({ example: 'María' })
  nombre: string;

  @ApiProperty({ example: 'García' })
  apellido: string;

  @ApiProperty({ example: 1 })
  idLista: number;

  @ApiProperty({ example: 'Lista Unidad' })
  nombreLista: string;

  @ApiPropertyOptional({ example: 'LU', nullable: true })
  siglaLista: string | null;

  @ApiPropertyOptional({ example: '#2f6f9f', nullable: true })
  colorLista: string | null;

  @ApiProperty({ example: 1 })
  idCategoria: number;

  @ApiProperty({ example: 'Presidente' })
  nombreCategoria: string;

  @ApiProperty({ example: 42, description: 'Votos on-chain (LAST_VOTE_WINS)' })
  votos: number;

  @ApiProperty({
    example: 35.5,
    description: 'Porcentaje sobre total de votos únicos (0 si total=0)',
  })
  porcentaje: number;
}

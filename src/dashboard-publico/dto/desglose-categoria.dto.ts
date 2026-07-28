import { ApiProperty } from '@nestjs/swagger';

export class DesgloseListaDto {
  @ApiProperty({ example: 10 })
  idLista: number;

  @ApiProperty({ example: 'Lista A' })
  nombreLista: string;

  @ApiProperty({ example: 12 })
  votos: number;
}

export class DesgloseCategoriaDto {
  @ApiProperty({ example: 1 })
  idCategoria: number;

  @ApiProperty({ example: 'Presidente' })
  nombreCategoria: string;

  @ApiProperty({ type: [DesgloseListaDto] })
  listas: DesgloseListaDto[];

  @ApiProperty({
    example: 0,
    description:
      'Tally global on-chain de votos en blanco (no desagregado por categoría)',
  })
  votosEnBlancoGlobales: number;

  @ApiProperty({
    example: 0,
    description:
      'Tally global on-chain de votos nulos (no desagregado por categoría)',
  })
  votosNulosGlobales: number;
}

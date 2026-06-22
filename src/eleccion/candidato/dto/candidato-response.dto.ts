import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CandidatoResponseDto {
  @ApiProperty()
  idCandidato: number;

  @ApiProperty()
  idLista: number;

  @ApiProperty()
  idCategoria: number;

  @ApiPropertyOptional({ description: 'Nombre del rol/categoría electoral' })
  categoriaNombre?: string;

  @ApiProperty()
  nombre: string;

  @ApiProperty()
  apellido: string;

  @ApiProperty()
  orden: number;

  @ApiPropertyOptional()
  fotoUrl: string | null;

  @ApiProperty({
    example: { legajo_utn: '14988', dni: '40123456', cantidad_avales: 3 },
  })
  datosAdicionales: Record<string, unknown>;
}

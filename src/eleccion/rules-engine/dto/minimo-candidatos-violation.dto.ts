import { ApiProperty } from '@nestjs/swagger';
import { MinimoCandidatosViolation } from '@/eleccion/rules-engine/interfaces/minimo-candidatos-context.interface';

export class MinimoCandidatosViolationDto implements MinimoCandidatosViolation {
  @ApiProperty({ example: 1 })
  idLista: number;

  @ApiProperty({ example: 'Lista A' })
  nombreLista: string;

  @ApiProperty({ example: 'LA' })
  siglaLista: string;

  @ApiProperty({ example: 1 })
  idCategoria: number;

  @ApiProperty({ example: 'Presidente' })
  nombreCategoria: string;

  @ApiProperty({ example: 5 })
  minimoRequerido: number;

  @ApiProperty({ example: 2 })
  cantidadActual: number;

  @ApiProperty({ example: 3 })
  faltantes: number;

  @ApiProperty({
    example:
      'La lista "Lista A" requiere 3 candidato(s) más en la categoría "Presidente" (tiene 2, mínimo 5).',
  })
  message: string;
}

export class MinimoCandidatosViolationResponseDto {
  @ApiProperty({ example: 422 })
  statusCode: number;

  @ApiProperty({
    example: 'No se puede oficializar: hay listas con candidatos insuficientes',
  })
  message: string;

  @ApiProperty({ type: [MinimoCandidatosViolationDto] })
  violations: MinimoCandidatosViolationDto[];
}

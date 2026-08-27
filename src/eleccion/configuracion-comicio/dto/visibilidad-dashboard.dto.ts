import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class GuardarVisibilidadDashboardDto {
  @ApiProperty({
    description:
      'Muestra la solapa "Resultados" en el Dashboard Público mientras el comicio está en curso',
    example: true,
  })
  @IsBoolean()
  mostrarResultados: boolean;

  @ApiProperty({
    description:
      'Muestra la solapa "Participación" en el Dashboard Público mientras el comicio está en curso',
    example: true,
  })
  @IsBoolean()
  mostrarParticipacion: boolean;

  @ApiProperty({
    description:
      'Muestra la solapa "Re-voto" en el Dashboard Público mientras el comicio está en curso',
    example: true,
  })
  @IsBoolean()
  mostrarRevoto: boolean;

  @ApiProperty({
    description:
      'Muestra la solapa "Transacciones" en el Dashboard Público mientras el comicio está en curso',
    example: true,
  })
  @IsBoolean()
  mostrarTransacciones: boolean;
}

export class VisibilidadDashboardResponseDto {
  @ApiProperty({ example: 1 })
  idEleccion: number;

  @ApiProperty({ example: true })
  mostrarResultados: boolean;

  @ApiProperty({ example: true })
  mostrarParticipacion: boolean;

  @ApiProperty({ example: true })
  mostrarRevoto: boolean;

  @ApiProperty({ example: true })
  mostrarTransacciones: boolean;

  @ApiProperty({
    description:
      'True cuando el comicio está en BORRADOR o CONFIGURADA y admite cambios',
    example: true,
  })
  editable: boolean;
}

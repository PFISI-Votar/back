import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class GuardarConfiguracionVotoNuloDto {
  @ApiProperty({
    description:
      'Habilita la opción "Anular voto" en la boleta única digital (BUD) del comicio',
    example: true,
  })
  @IsBoolean()
  permitirVotoNulo: boolean;
}

export class ConfiguracionVotoNuloResponseDto {
  @ApiProperty({ example: 1 })
  idEleccion: number;

  @ApiProperty({ example: true })
  permitirVotoNulo: boolean;

  @ApiProperty({
    description: 'True cuando el comicio está en BORRADOR y admite cambios',
    example: true,
  })
  editable: boolean;
}

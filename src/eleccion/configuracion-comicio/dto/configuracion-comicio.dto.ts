import { ApiProperty } from '@nestjs/swagger';
import { MetodoAutenticacion } from '@/eleccion/configuracion-comicio/enums/metodo-autenticacion.enum';

export class ConfiguracionComicioResponseDto {
  @ApiProperty({
    enum: MetodoAutenticacion,
    isArray: true,
    example: ['SSO_INSTITUCIONAL'],
  })
  metodosAutenticacion: MetodoAutenticacion[];
}

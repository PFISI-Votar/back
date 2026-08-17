import { ApiProperty } from '@nestjs/swagger';
import { ActaAperturaPlantillaDto } from '@/configuracion-sistema/dto/acta-apertura-plantilla.dto';
import type { ActaAperturaModo } from '@/configuracion-sistema/entities/configuracion-sistema.entity';

export class ConfiguracionSistemaResponseDto {
  @ApiProperty({
    example: '/uploads/sistema/logo-institucional-1700000000000-abc.jpg',
    nullable: true,
  })
  logoUrl: string | null;

  @ApiProperty({ type: ActaAperturaPlantillaDto })
  actaAperturaPlantilla: ActaAperturaPlantillaDto;

  @ApiProperty({ example: 'SIMPLE' })
  actaAperturaModo: ActaAperturaModo;

  @ApiProperty({ nullable: true })
  actaAperturaPlantillaTexto: string | null;

  @ApiProperty({ example: '2026-08-12T12:00:00.000Z' })
  fechaActualizacion: string;
}

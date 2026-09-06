import { ApiProperty } from '@nestjs/swagger';
import { ActaAperturaPlantillaDto } from '@/configuracion-sistema/dto/acta-apertura-plantilla.dto';
import { ActaCierrePlantillaDto } from '@/configuracion-sistema/dto/acta-cierre-plantilla.dto';
import type { ActaAperturaModo } from '@/configuracion-sistema/entities/configuracion-sistema.entity';

export class ConfiguracionSistemaResponseDto {
  @ApiProperty({
    example: '/imagenes/3f8c1c2a-5b1e-4a9d-9f0c-2b7e5d6a1c34',
    nullable: true,
  })
  logoUrl: string | null;

  @ApiProperty({ type: ActaAperturaPlantillaDto })
  actaAperturaPlantilla: ActaAperturaPlantillaDto;

  @ApiProperty({ example: 'SIMPLE' })
  actaAperturaModo: ActaAperturaModo;

  @ApiProperty({ nullable: true })
  actaAperturaPlantillaTexto: string | null;

  @ApiProperty({ type: ActaCierrePlantillaDto })
  actaCierrePlantilla: ActaCierrePlantillaDto;

  @ApiProperty({ example: 'SIMPLE' })
  actaCierreModo: ActaAperturaModo;

  @ApiProperty({ nullable: true })
  actaCierrePlantillaTexto: string | null;

  @ApiProperty({ example: '2026-08-12T12:00:00.000Z' })
  fechaActualizacion: string;
}

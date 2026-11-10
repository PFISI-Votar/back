import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  POPUP_ALERTA_DESCRIPCION_MAX_LENGTH,
  POPUP_ALERTA_TITULO_MAX_LENGTH,
} from '@/eleccion/configuracion-comicio/constants/popup-alerta.constants';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class GuardarConfiguracionPopupAlertaDto {
  @ApiProperty({
    description:
      'Habilita el pop-up de alerta que la BUD muestra antes de comenzar',
    example: true,
  })
  @IsBoolean()
  habilitado: boolean;

  @ApiPropertyOptional({
    description:
      'Título del pop-up. Obligatorio cuando habilitado es true. Se guarda tal cual; la BUD lo muestra en mayúsculas.',
    maxLength: POPUP_ALERTA_TITULO_MAX_LENGTH,
  })
  @ValidateIf((o: GuardarConfiguracionPopupAlertaDto) => o.habilitado === true)
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(POPUP_ALERTA_TITULO_MAX_LENGTH)
  titulo?: string;

  @ApiPropertyOptional({
    description:
      'Descripción del pop-up. Obligatoria cuando habilitado es true. Texto plano.',
    maxLength: POPUP_ALERTA_DESCRIPCION_MAX_LENGTH,
  })
  @ValidateIf((o: GuardarConfiguracionPopupAlertaDto) => o.habilitado === true)
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(POPUP_ALERTA_DESCRIPCION_MAX_LENGTH)
  descripcion?: string;
}

export class ConfiguracionPopupAlertaResponseDto {
  @ApiProperty({ example: 1 })
  idEleccion: number;

  @ApiProperty({ example: true })
  habilitado: boolean;

  @ApiPropertyOptional({ nullable: true, type: String })
  titulo: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  descripcion: string | null;

  @ApiProperty({
    description: 'True cuando el comicio no está ARCHIVADA y admite cambios',
    example: true,
  })
  editable: boolean;
}

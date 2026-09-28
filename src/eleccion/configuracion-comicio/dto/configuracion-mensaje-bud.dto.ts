import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { sanitizeOptionalPlainText } from '@/common/utils/sanitize-plain-text.util';
import {
  OBSERVACION_LOGIN_DEFAULT,
  OBSERVACION_LOGIN_MAX_LENGTH,
} from '@/eleccion/constants/observacion-login.constant';

export class GuardarMensajeBudDto {
  @ApiPropertyOptional({
    description:
      'Mensaje informativo en el login del BUD. Omitir o enviar null/vacío oculta el recuadro.',
    example: OBSERVACION_LOGIN_DEFAULT,
    maxLength: OBSERVACION_LOGIN_MAX_LENGTH,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(OBSERVACION_LOGIN_MAX_LENGTH)
  @Transform(({ value }: { value: unknown }) =>
    sanitizeOptionalPlainText(value),
  )
  observacionLogin?: string | null;
}

export class MensajeBudResponseDto {
  @ApiProperty({ example: 1 })
  idEleccion: number;

  @ApiPropertyOptional({
    example: OBSERVACION_LOGIN_DEFAULT,
    nullable: true,
  })
  observacionLogin: string | null;

  @ApiProperty({
    description: 'True cuando el comicio no está ARCHIVADO y admite cambios',
    example: true,
  })
  editable: boolean;
}

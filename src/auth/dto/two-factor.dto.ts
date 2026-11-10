import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, MinLength } from 'class-validator';

export class VerifyTwoFactorDto {
  @ApiProperty({
    description: 'Token temporal emitido tras validar usuario y contraseña',
  })
  @IsString()
  @IsNotEmpty()
  challengeToken: string;

  @ApiProperty({
    example: '123456',
    description: 'Código TOTP de 6 dígitos de la app autenticadora',
  })
  @IsString()
  @Length(6, 6)
  code: string;
}

export class ResetTwoFactorDto {
  @ApiProperty({
    description:
      'Contraseña institucional de Autogestión para invalidar el setup 2FA',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  password: string;
}

export class TwoFactorChallengeDto {
  @ApiProperty({
    enum: ['setup_required', 'verification_required'],
    example: 'setup_required',
  })
  status: 'setup_required' | 'verification_required';

  @ApiProperty({
    description: 'Token de desafío de corta duración para completar el 2FA',
  })
  challengeToken: string;

  @ApiProperty({
    required: false,
    description: 'URI otpauth:// para generar el QR (solo en setup)',
  })
  otpauthUrl?: string;

  @ApiProperty({
    required: false,
    description: 'Secreto en texto para ingreso manual (solo en setup)',
  })
  secret?: string;
}

export class TwoFactorStatusDto {
  @ApiProperty({ example: true })
  enabled: boolean;
}

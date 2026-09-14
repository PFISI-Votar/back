import { ApiProperty } from '@nestjs/swagger';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { TwoFactorChallengeDto } from '@/auth/dto/two-factor.dto';

export class AuthUserDto {
  @ApiProperty({ example: '14988' })
  sub: string;

  @ApiProperty({ enum: JwtRole, example: JwtRole.ELECTION_ADMIN })
  role: JwtRole;

  @ApiProperty({ example: 'admin@votar.local', required: false })
  email?: string;

  @ApiProperty({ example: 'Bruno Lucarelli', required: false })
  name?: string;

  @ApiProperty({
    example: false,
    required: false,
    description:
      'VOTAR-492 §12.2: true si la cuenta tiene rol PAUSER en autoridad_electoral ' +
      '(habilita revocación masiva de sesiones y bloqueo de autenticación en el panel).',
  })
  esPauser?: boolean;
}

export class AuthResponseDto {
  @ApiProperty({
    type: AuthUserDto,
    required: false,
    description:
      'Perfil del usuario autenticado. Presente solo cuando la sesión quedó completa. Los tokens se entregan en cookies HttpOnly.',
  })
  user?: AuthUserDto;

  @ApiProperty({
    type: TwoFactorChallengeDto,
    required: false,
    description:
      'Desafío 2FA pendiente. Presente tras login con contraseña válida de autoridad electoral sin sesión completa.',
  })
  twoFactor?: TwoFactorChallengeDto;
}

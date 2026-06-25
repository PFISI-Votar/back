import { ApiProperty } from '@nestjs/swagger';
import { JwtRole } from '@/auth/enums/jwt-role.enum';

export class AuthUserDto {
  @ApiProperty({ example: '14988' })
  sub: string;

  @ApiProperty({ enum: JwtRole, example: JwtRole.ELECTION_ADMIN })
  role: JwtRole;

  @ApiProperty({ example: 'admin@votar.local', required: false })
  email?: string;

  @ApiProperty({ example: 'Bruno Lucarelli', required: false })
  name?: string;
}

export class AuthResponseDto {
  @ApiProperty({
    type: AuthUserDto,
    description:
      'Perfil del usuario autenticado. Los tokens se entregan solo en cookies HttpOnly.',
  })
  user: AuthUserDto;
}

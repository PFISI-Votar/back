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
    description: 'JWT de acceso emitido por VOTAR',
  })
  accessToken: string;

  @ApiProperty({ type: AuthUserDto })
  user: AuthUserDto;
}

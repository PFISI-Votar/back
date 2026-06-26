import { ApiProperty } from '@nestjs/swagger';
import { JwtRole } from '@/auth/enums/jwt-role.enum';

export class VotanteAuthUserDto {
  @ApiProperty({ example: '14988' })
  sub: string;

  @ApiProperty({ enum: JwtRole, example: JwtRole.VOTER })
  role: JwtRole;

  @ApiProperty({ example: 1 })
  idEleccion: number;

  @ApiProperty({ example: 'votante@frvm.utn.edu.ar', required: false })
  email?: string;

  @ApiProperty({ example: 'Ana López', required: false })
  name?: string;
}

export class VotanteAuthResponseDto {
  @ApiProperty({
    type: VotanteAuthUserDto,
    description:
      'Perfil del votante autenticado. El JWT se entrega solo en cookie HttpOnly.',
  })
  user: VotanteAuthUserDto;
}

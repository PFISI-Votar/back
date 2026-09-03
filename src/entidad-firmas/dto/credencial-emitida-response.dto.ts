import { ApiProperty } from '@nestjs/swagger';

export class CredencialEmitidaResponseDto {
  @ApiProperty({
    description:
      'Instante (ISO 8601, redondeado al bucket de 5 min) tras el cual la credencial ya no puede canjearse por una firma institucional.',
    example: '2026-09-03T17:35:00.000Z',
  })
  expiraEn: string;
}

import { ApiProperty } from '@nestjs/swagger';

export class RelayAuthorizationResponseDto {
  @ApiProperty({
    description:
      'Token opaco de un solo uso. El cliente lo envía al cast sin cookies de sesión.',
  })
  relayToken: string;

  @ApiProperty()
  expiresAt: string;
}

export class RelayCastResponseDto {
  @ApiProperty()
  txHash: string;
}

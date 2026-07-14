import { ApiProperty } from '@nestjs/swagger';

export class JwkDto {
  @ApiProperty({ example: 'votar-bff-1', description: 'Key ID' })
  kid!: string;

  @ApiProperty({ example: 'RSA' })
  kty!: string;

  @ApiProperty({ example: 'RS256' })
  alg!: string;

  @ApiProperty({ example: 'sig' })
  use!: string;

  @ApiProperty({ description: 'Módulo RSA (base64url)' })
  n!: string;

  @ApiProperty({ example: 'AQAB', description: 'Exponente RSA (base64url)' })
  e!: string;
}

export class JwksDocumentDto {
  @ApiProperty({ type: [JwkDto] })
  keys!: JwkDto[];
}

import { ApiProperty } from '@nestjs/swagger';

export class ClavePublicaValidadorResponseDto {
  @ApiProperty({ example: 'ECDSA_SECP256K1_EIP712' })
  algoritmo: string;

  @ApiProperty({
    description:
      'Address de la clave pública de la Entidad de Firmas Digitales (VALIDATOR_ROLE).',
    example: '0x1234abcd1234abcd1234abcd1234abcd1234abcd',
  })
  clavePublica: string;
}

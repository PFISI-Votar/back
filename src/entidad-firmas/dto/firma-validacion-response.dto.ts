import { ApiProperty } from '@nestjs/swagger';

export class FirmaValidacionResponseDto {
  @ApiProperty({
    description:
      'Firma EIP-712 `Validation` de la Entidad de Firmas Digitales (hex, 65 bytes). Se adjunta como `validatorSignature` en castSignedVote.',
    example: '0x' + 'ab'.repeat(65),
  })
  firmaValidacion: string;

  @ApiProperty({
    description:
      'Address de la Entidad de Firmas Digitales (debe tener VALIDATOR_ROLE en el BallotContract).',
    example: '0x1234abcd1234abcd1234abcd1234abcd1234abcd',
  })
  direccionValidador: string;

  @ApiProperty({ example: 'ECDSA_SECP256K1_EIP712' })
  algoritmo: string;
}

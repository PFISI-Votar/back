import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Matches, Min } from 'class-validator';

const BYTES32_REGEX = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
const UINT_STRING_REGEX = /^[0-9]{1,78}$/;

/**
 * VOTAR-377 FASE 2 (anónima) — el cliente revela el secreto de la credencial junto
 * con la totalidad del payload del sufragio. La request llega SIN cookie ni JWT:
 * el backend nunca ve `votanteHash` y `selectionHash` en la misma llamada.
 */
export class SolicitarFirmaValidacionDto {
  @ApiProperty({
    description: 'Secreto de 32 bytes de la credencial (0x + 64 hex).',
    example:
      '0x1111111111111111111111111111111111111111111111111111111111111111',
  })
  @IsString()
  @Matches(BYTES32_REGEX, { message: 'secreto debe ser 0x + 64 hex' })
  secreto: string;

  @ApiProperty({
    description:
      'Nullifier anónimo derivado de la billetera efímera (VOTAR-353).',
    example:
      '0x2222222222222222222222222222222222222222222222222222222222222222',
  })
  @IsString()
  @Matches(BYTES32_REGEX, {
    message: 'nullifier debe ser bytes32 (0x + 64 hex)',
  })
  nullifier: string;

  @ApiProperty({
    description:
      'Hash de la selección de la boleta (keccak256 canónico del BUD).',
    example:
      '0x3333333333333333333333333333333333333333333333333333333333333333',
  })
  @IsString()
  @Matches(BYTES32_REGEX, {
    message: 'selectionHash debe ser bytes32 (0x + 64 hex)',
  })
  selectionHash: string;

  @ApiProperty({
    description:
      'Id de candidato de auditoría (o id reservado blanco/nulo). String para soportar uint256 completo.',
    example: '101',
  })
  @IsString()
  @Matches(UINT_STRING_REGEX, {
    message: 'candidateId debe ser un entero uint256 en base 10',
  })
  candidateId: string;

  @ApiProperty({
    description: 'Unix timestamp (segundos) capturado al firmar en el cliente.',
    example: 1_700_000_000,
  })
  @IsInt()
  @Min(0)
  timestamp: number;

  @ApiProperty({
    description:
      'Address efímera del votante (derivada de la clave pública comprimida).',
    example: '0x9BBDaC872c5781532ec32A9b14B906751d5B8C61',
  })
  @IsString()
  @Matches(ADDRESS_REGEX, { message: 'expectedSigner debe ser una address 0x' })
  expectedSigner: string;
}

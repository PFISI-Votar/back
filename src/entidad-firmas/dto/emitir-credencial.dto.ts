import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

const BYTES32_REGEX = /^0x[0-9a-fA-F]{64}$/;

/**
 * VOTAR-377 FASE 1 — el cliente genera un secreto de 32 bytes que sólo vive en el
 * RAM del navegador y envía únicamente su compromiso `keccak256(secreto)`.
 */
export class EmitirCredencialDto {
  @ApiProperty({
    description: 'keccak256 del secreto de la credencial (0x + 64 hex)',
    example:
      '0x7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
  })
  @IsString()
  @Matches(BYTES32_REGEX, {
    message: 'commit debe ser keccak256 en formato 0x + 64 hex',
  })
  commit: string;
}

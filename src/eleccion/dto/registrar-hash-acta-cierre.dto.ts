import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;

export class RegistrarHashActaCierreDto {
  @ApiProperty({
    example: 'a'.repeat(64),
    description:
      'Hash SHA-256 (hex, 64 caracteres) del PDF del Acta de Cierre emitido',
  })
  @IsString()
  @Matches(SHA256_HEX_PATTERN, {
    message: 'hashPdf debe ser un hash SHA-256 en hexadecimal (64 caracteres)',
  })
  hashPdf: string;
}

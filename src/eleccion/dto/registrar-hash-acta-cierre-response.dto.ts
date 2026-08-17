import { ApiProperty } from '@nestjs/swagger';

export class RegistrarHashActaCierreResponseDto {
  @ApiProperty({ example: 123 })
  idLog: number;

  @ApiProperty({ example: 'a'.repeat(64) })
  hashPdfSha256: string;

  @ApiProperty({ example: '2026-09-01T18:05:00.000Z' })
  timestamp: string;
}

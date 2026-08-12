import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * VOTAR-451 — optional on-chain sync target so finalize + catch-up are idempotent.
 * When set, the backend raises `votosConsumidos` to max(current, min(objetivo, max)).
 */
export class RegistrarConsumoDto {
  @ApiPropertyOptional({
    description:
      'Votos ya contabilizados on-chain para este nullifier (sync idempotente).',
    minimum: 1,
    maximum: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  votosObjetivo?: number;
}

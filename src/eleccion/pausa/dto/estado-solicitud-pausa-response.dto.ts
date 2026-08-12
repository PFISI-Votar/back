import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SolicitudPausaTipo } from '@/eleccion/pausa/enums/solicitud-pausa-tipo.enum';

export class EstadoSolicitudPausaResponseDto {
  @ApiProperty({ enum: SolicitudPausaTipo })
  tipo!: SolicitudPausaTipo;

  @ApiProperty({
    example: 1,
    description:
      'Confirmaciones de autoridades distintas recibidas hasta ahora.',
  })
  confirmaciones!: number;

  @ApiProperty({
    example: 2,
    description:
      'Confirmaciones requeridas para ejecutar la operación on-chain.',
  })
  requeridas!: number;

  @ApiProperty({
    description:
      'true si esta llamada hizo que se ejecutara la transacción on-chain.',
  })
  ejecutada!: boolean;

  @ApiPropertyOptional({
    description:
      'Razón registrada por quien creó la solicitud (solo aplica a tipo PAUSAR).',
  })
  razon?: string | null;

  @ApiPropertyOptional()
  txHashBallot?: string | null;

  @ApiPropertyOptional()
  txHashVoteRegistry?: string | null;
}

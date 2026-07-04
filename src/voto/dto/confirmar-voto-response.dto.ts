import { ApiProperty } from '@nestjs/swagger';

export class ConfirmarVotoResponseDto {
  @ApiProperty()
  idEleccion: number;

  @ApiProperty()
  estado: string;

  @ApiProperty()
  comprobanteHash: string;

  @ApiProperty()
  payloadHash: string;

  @ApiProperty()
  recibidoEn: Date;

  @ApiProperty()
  idempotente: boolean;

  // Campos de recibo blockchain (VOTAR-360)
  @ApiProperty({ required: false })
  txHash?: string;

  @ApiProperty({ required: false })
  blockNumber?: number;

  @ApiProperty({ required: false })
  contractAddress?: string;

  @ApiProperty()
  codigoVerificacionE2E: string;

  @ApiProperty({ required: false })
  txStatus?: string;
}

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
}

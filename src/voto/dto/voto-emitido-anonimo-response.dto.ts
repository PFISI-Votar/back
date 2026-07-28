import { ApiProperty } from '@nestjs/swagger';

export class VotoEmitidoAnonimoResponseDto {
  @ApiProperty({ example: true })
  registrado!: boolean;

  @ApiProperty({ example: 12 })
  idEleccion!: number;
}

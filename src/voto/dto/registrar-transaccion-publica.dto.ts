import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class RegistrarTransaccionPublicaDto {
  @ApiProperty({
    example:
      '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
  })
  @IsString()
  @Matches(/^0x[0-9a-fA-F]{64}$/, {
    message: 'txHash debe ser un hash hexadecimal de 32 bytes',
  })
  txHash: string;
}

export class RegistrarTransaccionPublicaResponseDto {
  @ApiProperty({ example: true })
  registrado: boolean;

  @ApiProperty({ example: 7 })
  idEleccion: number;
}

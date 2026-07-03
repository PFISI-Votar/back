import { ApiProperty } from '@nestjs/swagger';

export class TotalVotantesResponseDto {
  @ApiProperty({ example: 1500 })
  totalVotantesHabilitados: number;
}

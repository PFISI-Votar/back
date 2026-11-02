import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { CriterioHashPadron } from '../enums/criterio-hash-padron.enum';

export class ImportarPadronBodyDto {
  @ApiPropertyOptional({
    enum: CriterioHashPadron,
    default: CriterioHashPadron.DNI,
    description:
      'Criterio para generar el hash de la hoja (DNI, EMAIL, DNI_Y_EMAIL)',
  })
  @IsOptional()
  @IsEnum(CriterioHashPadron)
  criterioHash?: CriterioHashPadron;
}

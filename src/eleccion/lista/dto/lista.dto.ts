import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { sanitizePlainText } from '@/common/utils/sanitize-plain-text.util';

export class CreateListaDto {
  @ApiProperty({ example: 'Lista Renovación' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) => sanitizePlainText(value))
  nombre: string;

  @ApiProperty({ example: 'REN' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Transform(({ value }: { value: unknown }) => sanitizePlainText(value))
  sigla: string;

  @ApiPropertyOptional({ example: '#2563eb' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'El color debe ser un código hexadecimal válido (ej. #2563eb)',
  })
  color?: string;
}

export class UpdateListaDto {
  @ApiPropertyOptional({ example: 'Lista Renovación' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) => sanitizePlainText(value))
  nombre?: string;

  @ApiPropertyOptional({ example: 'REN' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Transform(({ value }: { value: unknown }) => sanitizePlainText(value))
  sigla?: string;

  @ApiPropertyOptional({ example: '#2563eb' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'El color debe ser un código hexadecimal válido (ej. #2563eb)',
  })
  color?: string;
}

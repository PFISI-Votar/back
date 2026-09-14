import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const BYTES32 = /^(0x)?[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BYTES = /^0x([0-9a-fA-F]{2})+$/;
const UINT = /^\d+$/;

export class RelayCastDto {
  @ApiProperty({ description: 'Hoja Merkle del padrón (bytes32).' })
  @IsString()
  @Matches(BYTES32)
  voterLeaf: string;

  @ApiProperty()
  @IsString()
  @Matches(BYTES32)
  nullifier: string;

  @ApiProperty()
  @IsString()
  @Matches(BYTES32)
  selectionHash: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  @Matches(UINT, { each: true })
  candidateIds: string[];

  @ApiProperty({
    description: 'Unix timestamp del payload EIP-712, como string.',
  })
  @IsString()
  @Matches(UINT)
  @MaxLength(20)
  timestamp: string;

  @ApiProperty()
  @IsString()
  @Matches(ADDRESS)
  expectedSigner: string;

  @ApiProperty()
  @IsString()
  @Matches(BYTES)
  signature: string;

  @ApiProperty()
  @IsString()
  @Matches(BYTES)
  validatorSignature: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  @Matches(BYTES32, { each: true })
  merkleProof: string[];

  @ApiProperty({
    description:
      'Capacidad de un solo uso emitida por POST /relayer/autorizacion. No es un JWT de sesión.',
  })
  @IsString()
  @Matches(/^[0-9a-fA-F]{64}$/)
  relayToken: string;
}

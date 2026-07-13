import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ElectionFactoryContratoResponseDto } from '@/blockchain/dto/election-factory-contrato-response.dto';
import { RedBlockchain } from '@/blockchain/enums/contrato-blockchain.enum';
import { ContratoBlockchainService } from '@/blockchain/services/contrato-blockchain.service';

/**
 * Public contract registry endpoints (VOTAR-337).
 * Exposes ElectionFactory address + ABI for dynamic frontend/backend calls.
 */
@ApiTags('blockchain')
@Controller('blockchain/contratos')
export class ContratoBlockchainController {
  constructor(
    private readonly contratoBlockchainService: ContratoBlockchainService,
  ) {}

  @Get('election-factory')
  @ApiOperation({
    summary:
      'Obtener dirección y ABI del ElectionFactory registrado en PostgreSQL',
    description:
      'Tras el deploy Sepolia y `npm run sync:election-factory`, el frontend puede llamar a la factory sin configuración manual.',
  })
  @ApiQuery({
    name: 'red',
    required: false,
    enum: RedBlockchain,
    description:
      'Filtra por red; si se omite, devuelve el registro más reciente',
  })
  @ApiResponse({ status: 200, type: ElectionFactoryContratoResponseDto })
  @ApiResponse({ status: 404, description: 'Factory no registrada' })
  getElectionFactory(
    @Query('red') red?: RedBlockchain,
  ): Promise<ElectionFactoryContratoResponseDto> {
    return this.contratoBlockchainService.getElectionFactory(red);
  }
}

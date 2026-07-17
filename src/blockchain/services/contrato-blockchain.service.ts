import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContratoBlockchain } from '@/blockchain/entities/contrato-blockchain.entity';
import {
  RedBlockchain,
  TipoContratoBlockchain,
} from '@/blockchain/enums/contrato-blockchain.enum';
import { ElectionFactoryContratoResponseDto } from '@/blockchain/dto/election-factory-contrato-response.dto';

export type UpsertElectionFactoryInput = {
  direccionContrato: string;
  abi: unknown[];
  abiHash: string;
  red: RedBlockchain;
  chainId: number;
  txHashDespliegue?: string | null;
  fechaDespliegue?: Date | null;
  verificadoEtherscan?: boolean;
  merkleRootStoreAddress?: string | null;
  adminAddress?: string | null;
};

/**
 * Persists and exposes master contract address + ABI (VOTAR-337 / UAT-02).
 */
@Injectable()
export class ContratoBlockchainService {
  constructor(
    @InjectRepository(ContratoBlockchain)
    private readonly contratoRepository: Repository<ContratoBlockchain>,
  ) {}

  async upsertElectionFactory(
    input: UpsertElectionFactoryInput,
  ): Promise<ContratoBlockchain> {
    const existing = await this.contratoRepository.findOne({
      where: {
        tipo: TipoContratoBlockchain.ELECTION_FACTORY,
        red: input.red,
      },
    });

    const entity =
      existing ??
      this.contratoRepository.create({
        tipo: TipoContratoBlockchain.ELECTION_FACTORY,
        nombre: 'ElectionFactory',
      });
    entity.tipo = TipoContratoBlockchain.ELECTION_FACTORY;
    entity.nombre = 'ElectionFactory';
    entity.direccionContrato = input.direccionContrato;
    entity.abi = input.abi;
    entity.abiHash = input.abiHash;
    entity.red = input.red;
    entity.chainId = input.chainId;
    entity.txHashDespliegue = input.txHashDespliegue ?? null;
    entity.fechaDespliegue = input.fechaDespliegue ?? null;
    entity.verificadoEtherscan = input.verificadoEtherscan ?? false;
    entity.merkleRootStoreAddress = input.merkleRootStoreAddress ?? null;
    entity.adminAddress = input.adminAddress ?? null;

    return this.contratoRepository.save(entity);
  }

  async getElectionFactory(
    red?: RedBlockchain,
  ): Promise<ElectionFactoryContratoResponseDto> {
    const where = red
      ? { tipo: TipoContratoBlockchain.ELECTION_FACTORY, red }
      : { tipo: TipoContratoBlockchain.ELECTION_FACTORY };

    const contrato = await this.contratoRepository.findOne({
      where,
      order: { fechaActualizacion: 'DESC' },
    });

    if (!contrato) {
      throw new NotFoundException(
        'ElectionFactory no registrada en la base de datos. Ejecutá el sync tras el deploy.',
      );
    }

    return this.toFactoryDto(contrato);
  }

  private toFactoryDto(
    contrato: ContratoBlockchain,
  ): ElectionFactoryContratoResponseDto {
    return {
      direccionContrato: contrato.direccionContrato,
      abi: contrato.abi,
      abiHash: contrato.abiHash,
      red: contrato.red,
      chainId: contrato.chainId,
      verificadoEtherscan: contrato.verificadoEtherscan,
      merkleRootStoreAddress: contrato.merkleRootStoreAddress,
      adminAddress: contrato.adminAddress,
      txHashDespliegue: contrato.txHashDespliegue,
      fechaDespliegue: contrato.fechaDespliegue,
    };
  }
}

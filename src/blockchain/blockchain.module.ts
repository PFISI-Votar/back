import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlockchainService } from './blockchain.service';
import { ContratoBlockchainController } from './controllers/contrato-blockchain.controller';
import { ContratoBlockchain } from './entities/contrato-blockchain.entity';
import { TransaccionBlockchain } from './entities/transaccion-blockchain.entity';
import { ContratoBlockchainService } from './services/contrato-blockchain.service';
import { TransaccionBlockchainService } from './services/transaccion-blockchain.service';
import { PadronElectoral } from '@/padron/entities/padron-electoral.entity';
import { MerkleTree } from '@/padron/entities/merkle-tree.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ContratoBlockchain,
      TransaccionBlockchain,
      MerkleTree,
      PadronElectoral,
    ]),
  ],
  controllers: [ContratoBlockchainController],
  providers: [
    BlockchainService,
    ContratoBlockchainService,
    TransaccionBlockchainService,
  ],
  exports: [
    BlockchainService,
    ContratoBlockchainService,
    TransaccionBlockchainService,
  ],
})
export class BlockchainModule {}

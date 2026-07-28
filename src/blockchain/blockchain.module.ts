import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlockchainService } from './blockchain.service';
import { ContratoBlockchainController } from './controllers/contrato-blockchain.controller';
import { ContratoBlockchain } from './entities/contrato-blockchain.entity';
import { ContratoBlockchainService } from './services/contrato-blockchain.service';

@Module({
  imports: [TypeOrmModule.forFeature([ContratoBlockchain])],
  controllers: [ContratoBlockchainController],
  providers: [BlockchainService, ContratoBlockchainService],
  exports: [BlockchainService, ContratoBlockchainService],
})
export class BlockchainModule {}

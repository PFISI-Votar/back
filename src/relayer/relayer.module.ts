import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlockchainModule } from '@/blockchain/blockchain.module';
import { CommonRateLimitModule } from '@/common/rate-limit/common-rate-limit.module';
import { PadronModule } from '@/padron/padron.module';
import { RelayerCapacidad } from '@/relayer/entities/relayer-capacidad.entity';
import { EthersRelayBroadcaster } from '@/relayer/ethers-relay-broadcaster';
import { RelayerController } from '@/relayer/relayer.controller';
import { RelayerService } from '@/relayer/relayer.service';

@Module({
  imports: [
    BlockchainModule,
    CommonRateLimitModule,
    PadronModule,
    TypeOrmModule.forFeature([RelayerCapacidad]),
  ],
  controllers: [RelayerController],
  providers: [RelayerService, EthersRelayBroadcaster],
})
export class RelayerModule {}

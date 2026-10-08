import { Module } from '@nestjs/common';
import { FaucetService } from './services/faucet.service';
import { FaucetRecargaScheduler } from './services/faucet-recarga.scheduler';
import { MailModule } from '@/common/mail/mail.module';
import { RpcModule } from '@/blockchain/rpc/rpc.module';

@Module({
  imports: [MailModule, RpcModule],
  providers: [FaucetService, FaucetRecargaScheduler],
  exports: [FaucetService],
})
export class FaucetModule {}

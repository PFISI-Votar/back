import { Module } from '@nestjs/common';
import { RpcProviderFactory } from './rpc-provider.factory';

@Module({
  providers: [RpcProviderFactory],
  exports: [RpcProviderFactory],
})
export class RpcModule {}

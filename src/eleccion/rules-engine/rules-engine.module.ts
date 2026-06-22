import { Module } from '@nestjs/common';
import { RulesEngineService } from '@/eleccion/rules-engine/rules-engine.service';

@Module({
  providers: [RulesEngineService],
  exports: [RulesEngineService],
})
export class RulesEngineModule {}

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlockchainModule } from '@/blockchain/blockchain.module';
import { CommonRateLimitModule } from '@/common/rate-limit/common-rate-limit.module';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { EleccionesModule } from '@/eleccion/eleccion.module';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { PadronElectoral } from '@/padron/entities/padron-electoral.entity';
import { SeccionDashboardVisibleGuard } from '@/dashboard-publico/guards/seccion-dashboard-visible.guard';
import { EscrutinioPublicController } from '@/escrutinio/controllers/escrutinio-public.controller';
import { EscrutinioCacheService } from '@/escrutinio/services/escrutinio-cache.service';
import { EscrutinioPollerService } from '@/escrutinio/services/escrutinio-poller.service';
import { EscrutinioService } from '@/escrutinio/services/escrutinio.service';

@Module({
  imports: [
    BlockchainModule,
    CommonRateLimitModule,
    forwardRef(() => EleccionesModule),
    TypeOrmModule.forFeature([
      Eleccion,
      ConfiguracionComicio,
      Boleta,
      Lista,
      Candidato,
      PadronElectoral,
    ]),
  ],
  controllers: [EscrutinioPublicController],
  providers: [
    EscrutinioService,
    EscrutinioCacheService,
    EscrutinioPollerService,
    SeccionDashboardVisibleGuard,
  ],
  exports: [EscrutinioService, EscrutinioCacheService],
})
export class EscrutinioModule {}

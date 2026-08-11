import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlockchainModule } from '@/blockchain/blockchain.module';
import { ParticipacionPublicController } from '@/dashboard-publico/controllers/participacion-public.controller';
import { RevotoStatsPublicController } from '@/dashboard-publico/controllers/revoto-stats-public.controller';
import { TransaccionesPublicController } from '@/dashboard-publico/controllers/transacciones-public.controller';
import { ParticipacionSnapshot } from '@/dashboard-publico/entities/participacion-snapshot.entity';
import { ParticipacionPublicService } from '@/dashboard-publico/services/participacion-public.service';
import { ParticipacionSamplerService } from '@/dashboard-publico/services/participacion-sampler.service';
import { RevotoStatsPublicService } from '@/dashboard-publico/services/revoto-stats-public.service';
import { TransaccionesPublicService } from '@/dashboard-publico/services/transacciones-public.service';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { ListaModule } from '@/eleccion/lista/lista.module';
import { PadronModule } from '@/padron/padron.module';

@Module({
  imports: [
    BlockchainModule,
    PadronModule,
    ListaModule,
    TypeOrmModule.forFeature([
      Eleccion,
      ConfiguracionComicio,
      ParticipacionSnapshot,
    ]),
  ],
  controllers: [
    ParticipacionPublicController,
    RevotoStatsPublicController,
    TransaccionesPublicController,
  ],
  providers: [
    ParticipacionPublicService,
    RevotoStatsPublicService,
    TransaccionesPublicService,
    ParticipacionSamplerService,
  ],
  exports: [
    ParticipacionSamplerService, // exportado para CierreComicioService
  ],
})
export class DashboardPublicoModule {}

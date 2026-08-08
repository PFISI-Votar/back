import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlockchainModule } from '@/blockchain/blockchain.module';
import { ParticipacionPublicController } from '@/dashboard-publico/controllers/participacion-public.controller';
import { ParticipacionPublicService } from '@/dashboard-publico/services/participacion-public.service';
import { ParticipacionSamplerService } from '@/dashboard-publico/services/participacion-sampler.service';
import { ParticipacionSnapshot } from '@/dashboard-publico/entities/participacion-snapshot.entity';
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
  controllers: [ParticipacionPublicController],
  providers: [ParticipacionPublicService, ParticipacionSamplerService],
  exports: [
    ParticipacionSamplerService, // exportado para CierreComicioService
  ],
})
export class DashboardPublicoModule {}

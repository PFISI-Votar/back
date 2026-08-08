import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlockchainModule } from '@/blockchain/blockchain.module';
import { ParticipacionPublicController } from '@/dashboard-publico/controllers/participacion-public.controller';
import { ContratoEstadoPublicController } from '@/dashboard-publico/controllers/contrato-estado-public.controller';
import { ParticipacionPublicService } from '@/dashboard-publico/services/participacion-public.service';
import { ContratoEstadoPublicService } from '@/dashboard-publico/services/contrato-estado-public.service';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { ListaModule } from '@/eleccion/lista/lista.module';
import { PadronModule } from '@/padron/padron.module';

@Module({
  imports: [
    BlockchainModule,
    PadronModule,
    ListaModule,
    TypeOrmModule.forFeature([Eleccion, ConfiguracionComicio]),
  ],
  controllers: [ParticipacionPublicController, ContratoEstadoPublicController],
  providers: [ParticipacionPublicService, ContratoEstadoPublicService],
})
export class DashboardPublicoModule {}

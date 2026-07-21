import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlockchainModule } from '@/blockchain/blockchain.module';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { EleccionesModule } from '@/eleccion/eleccion.module';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { PadronElectoral } from '@/padron/entities/padron-electoral.entity';
import { EscrutinioPublicController } from '@/escrutinio/controllers/escrutinio-public.controller';
import { EscrutinioPublicRateLimitGuard } from '@/escrutinio/guards/escrutinio-public-rate-limit.guard';
import { EscrutinioCacheService } from '@/escrutinio/services/escrutinio-cache.service';
import { EscrutinioPollerService } from '@/escrutinio/services/escrutinio-poller.service';
import { EscrutinioService } from '@/escrutinio/services/escrutinio.service';

@Module({
  imports: [
    BlockchainModule,
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
    EscrutinioPublicRateLimitGuard,
  ],
  exports: [EscrutinioService, EscrutinioCacheService],
})
export class EscrutinioModule {}

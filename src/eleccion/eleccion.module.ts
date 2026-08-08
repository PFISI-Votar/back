import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CandidatoModule } from '@/eleccion/candidato/candidato.module';
import { ConfiguracionComicioModule } from '@/eleccion/configuracion-comicio/configuracion-comicio.module';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { EleccionesController } from '@/eleccion/controllers/eleccion.controller';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EleccionGateway } from '@/eleccion/gateways/eleccion.gateway';
import { ELECCION_REPOSITORY } from '@/eleccion/interfaces/eleccion.repository.interface';
import { ParticipacionSnapshot } from '@/dashboard-publico/entities/participacion-snapshot.entity';
import { ListaModule } from '@/eleccion/lista/lista.module';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { EleccionRepository } from '@/eleccion/repositories/eleccion.repository';
import { EleccionesService } from '@/eleccion/services/eleccion.service';
import { AperturaComicioService } from '@/eleccion/services/apertura-comicio.service';
import { AperturaAutomaticaScheduler } from '@/eleccion/services/apertura-automatica.scheduler';
import { CierreComicioService } from '@/eleccion/services/cierre-comicio.service';
import { CierreAutomaticoScheduler } from '@/eleccion/services/cierre-automatico.scheduler';
import { ElectionStateService } from '@/eleccion/services/election-state.service';
import { PadronElectoral } from '@/padron/entities/padron-electoral.entity';
import { MerkleTree } from '@/padron/entities/merkle-tree.entity';
import { BlockchainModule } from '@/blockchain/blockchain.module';
import { AuditModule } from '@/audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Eleccion,
      ConfiguracionComicio,
      Boleta,
      Categoria,
      PadronElectoral,
      MerkleTree,
      ParticipacionSnapshot,
    ]),
    ListaModule,
    CandidatoModule,
    ConfiguracionComicioModule,
    BlockchainModule,
    AuditModule,
  ],
  controllers: [EleccionesController],
  providers: [
    EleccionesService,
    EleccionGateway,
    ElectionStateService,
    AperturaComicioService,
    AperturaAutomaticaScheduler,
    CierreComicioService,
    CierreAutomaticoScheduler,
    {
      provide: ELECCION_REPOSITORY,
      useClass: EleccionRepository,
    },
  ],
  exports: [
    ELECCION_REPOSITORY,
    AperturaComicioService,
    CierreComicioService,
    EleccionGateway,
  ],
})
export class EleccionesModule {}

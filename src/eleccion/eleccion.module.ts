import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CandidatoModule } from '@/eleccion/candidato/candidato.module';
import { ConfiguracionComicioModule } from '@/eleccion/configuracion-comicio/configuracion-comicio.module';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { ConfiguracionSistemaModule } from '@/configuracion-sistema/configuracion-sistema.module';
import { AutoridadElectoral } from '@/auth/entities/autoridad-electoral.entity';
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
import { ActaAperturaService } from '@/eleccion/services/acta-apertura.service';
import { ActaCierreService } from '@/eleccion/services/acta-cierre.service';
import { AperturaComicioService } from '@/eleccion/services/apertura-comicio.service';
import { AperturaAutomaticaScheduler } from '@/eleccion/services/apertura-automatica.scheduler';
import { CierreComicioService } from '@/eleccion/services/cierre-comicio.service';
import { CierreAutomaticoScheduler } from '@/eleccion/services/cierre-automatico.scheduler';
import { ElectionStateService } from '@/eleccion/services/election-state.service';
import { PausaComicioService } from '@/eleccion/pausa/services/pausa-comicio.service';
import { SolicitudPausa } from '@/eleccion/pausa/entities/solicitud-pausa.entity';
import { ConfirmacionPausa } from '@/eleccion/pausa/entities/confirmacion-pausa.entity';
import { ArchivarComicioService } from '@/eleccion/services/archivar-comicio.service';
import { PadronElectoral } from '@/padron/entities/padron-electoral.entity';
import { MerkleTree } from '@/padron/entities/merkle-tree.entity';
import { PadronModule } from '@/padron/padron.module';
import { BlockchainModule } from '@/blockchain/blockchain.module';
import { AuditModule } from '@/audit/audit.module';
import { EscrutinioModule } from '@/escrutinio/escrutinio.module';

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
      SolicitudPausa,
      ConfirmacionPausa,
      // VOTAR-347 — PauserRoleGuard (global, vía AuthModule) es instanciado en el
      // scope de este módulo; sin este forFeature, Nest no puede resolver el
      // repositorio que el guard inyecta (mismo motivo por el que AuditModule
      // está importado abajo, para RolesGuard/AuditLoggerService).
      AutoridadElectoral,
    ]),
    ListaModule,
    CandidatoModule,
    ConfiguracionComicioModule,
    ConfiguracionSistemaModule,
    BlockchainModule,
    AuditModule,
    forwardRef(() => PadronModule),
    forwardRef(() => EscrutinioModule),
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
    PausaComicioService,
    ArchivarComicioService,
    ActaAperturaService,
    ActaCierreService,
    {
      provide: ELECCION_REPOSITORY,
      useClass: EleccionRepository,
    },
  ],
  exports: [
    ELECCION_REPOSITORY,
    AperturaComicioService,
    CierreComicioService,
    PausaComicioService,
    EleccionGateway,
  ],
})
export class EleccionesModule {}

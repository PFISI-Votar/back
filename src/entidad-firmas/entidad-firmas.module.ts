import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '@/audit/audit.module';
import { BlockchainModule } from '@/blockchain/blockchain.module';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { EntidadFirmasController } from '@/entidad-firmas/controllers/entidad-firmas.controller';
import { EntidadFirmasPublicController } from '@/entidad-firmas/controllers/entidad-firmas-public.controller';
import { CredencialValidacion } from '@/entidad-firmas/entities/credencial-validacion.entity';
import { EmisionCredencial } from '@/entidad-firmas/entities/emision-credencial.entity';
import { CredencialValidacionService } from '@/entidad-firmas/services/credencial-validacion.service';
import { EntidadFirmasService } from '@/entidad-firmas/services/entidad-firmas.service';
import { FirmaInstitucionalService } from '@/entidad-firmas/services/firma-institucional.service';
import { PadronModule } from '@/padron/padron.module';

/**
 * VOTAR-377 — "Entidad de Firmas Digitales" (Tercero de Confianza). Certifica con
 * una firma institucional ECDSA (Ley 25.506) que el emisor de un sufragio
 * pertenece al padrón habilitado, sin poder vincular su identidad con la selección
 * partidaria (esquema de dos fases con credencial anónima commit/reveal).
 */
@Module({
  imports: [
    AuditModule,
    BlockchainModule,
    PadronModule,
    TypeOrmModule.forFeature([
      CredencialValidacion,
      EmisionCredencial,
      Eleccion,
      ConfiguracionComicio,
    ]),
  ],
  controllers: [EntidadFirmasController, EntidadFirmasPublicController],
  providers: [
    CredencialValidacionService,
    FirmaInstitucionalService,
    EntidadFirmasService,
  ],
})
export class EntidadFirmasModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '@/audit/audit.module';
import { BlockchainModule } from '@/blockchain/blockchain.module';
import { CommonRateLimitModule } from '@/common/rate-limit/common-rate-limit.module';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { ListaModule } from '@/eleccion/lista/lista.module';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { PadronModule } from '@/padron/padron.module';
import { PadronVotante } from '@/padron/entities/padron-votante.entity';
import { BudPublicController } from '@/voto/controllers/bud-public.controller';
import { ReciboPublicController } from '@/voto/controllers/recibo-public.controller';
import { VotoController } from '@/voto/controllers/voto.controller';
import { RegistroIntentoSufragio } from '@/voto/entities/registro-intento-sufragio.entity';
import { ReciboService } from '@/voto/services/recibo.service';
import { RevotePolicyService } from '@/voto/services/revote-policy.service';
import { VotoService } from '@/voto/services/voto.service';

@Module({
  imports: [
    AuditModule,
    BlockchainModule,
    CommonRateLimitModule,
    PadronModule,
    ListaModule,
    TypeOrmModule.forFeature([
      Eleccion,
      ConfiguracionComicio,
      Boleta,
      Categoria,
      Lista,
      Candidato,
      PadronVotante,
      RegistroIntentoSufragio,
    ]),
  ],
  controllers: [BudPublicController, VotoController, ReciboPublicController],
  providers: [VotoService, ReciboService, RevotePolicyService],
})
export class VotoModule {}

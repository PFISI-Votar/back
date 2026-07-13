import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '@/audit/audit.module';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { PadronModule } from '@/padron/padron.module';
import { PadronVotante } from '@/padron/entities/padron-votante.entity';
import { BudPublicController } from '@/voto/controllers/bud-public.controller';
import { ReciboController } from '@/voto/controllers/recibo.controller';
import { VotoController } from '@/voto/controllers/voto.controller';
import { MerkleProofRateLimitGuard } from '@/voto/guards/merkle-proof-rate-limit.guard';
import { VotoEmitidoAnonimoRateLimitGuard } from '@/voto/guards/voto-emitido-anonimo-rate-limit.guard';
import { VotoService } from '@/voto/services/voto.service';

@Module({
  imports: [
    AuditModule,
    PadronModule,
    TypeOrmModule.forFeature([
      Eleccion,
      ConfiguracionComicio,
      Boleta,
      Categoria,
      Lista,
      Candidato,
      PadronVotante,
    ]),
  ],
  controllers: [BudPublicController, VotoController, ReciboController],
  providers: [
    VotoService,
    MerkleProofRateLimitGuard,
    VotoEmitidoAnonimoRateLimitGuard,
  ],
})
export class VotoModule {}

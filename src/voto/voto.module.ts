import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { Candidato } from '@/eleccion/candidato/entities/candidato.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { PadronVotante } from '@/padron/entities/padron-votante.entity';
import { VotoController } from '@/voto/controllers/voto.controller';
import { VotoConfirmacion } from '@/voto/entities/voto-confirmacion.entity';
import { VotanteSessionGuard } from '@/voto/guards/votante-session.guard';
import { VotoRateLimitGuard } from '@/voto/guards/voto-rate-limit.guard';
import { VotoService } from '@/voto/services/voto.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Eleccion,
      ConfiguracionComicio,
      Boleta,
      Categoria,
      Lista,
      Candidato,
      PadronVotante,
      VotoConfirmacion,
    ]),
  ],
  controllers: [VotoController],
  providers: [VotoService, VotanteSessionGuard, VotoRateLimitGuard],
})
export class VotoModule {}

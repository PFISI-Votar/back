import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlockchainModule } from '@/blockchain/blockchain.module';
import { CategoriasModule } from '@/categoria/categoria.module';
import { PadronModule } from '@/padron/padron.module';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { RulesEngineModule } from '@/eleccion/rules-engine/rules-engine.module';
import { ListaController } from '@/eleccion/lista/controllers/lista.controller';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { BoletaService } from '@/eleccion/lista/services/boleta.service';
import { ListaService } from '@/eleccion/lista/services/lista.service';
import { OfertaElectoralQueryService } from '@/eleccion/lista/services/oferta-electoral-query.service';
import { OficializacionService } from '@/eleccion/lista/services/oficializacion.service';
import { ElectoralImageModule } from '@/common/images/electoral-image.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Eleccion,
      Lista,
      Boleta,
      Categoria,
      ConfiguracionComicio,
    ]),
    RulesEngineModule,
    CategoriasModule,
    BlockchainModule,
    forwardRef(() => PadronModule),
    ElectoralImageModule,
  ],
  controllers: [ListaController],
  providers: [
    ListaService,
    BoletaService,
    OficializacionService,
    OfertaElectoralQueryService,
  ],
  exports: [ListaService, BoletaService, OfertaElectoralQueryService],
})
export class ListaModule {}

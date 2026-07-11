import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriasModule } from '@/categoria/categoria.module';
import { PadronModule } from '@/padron/padron.module';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { RulesEngineModule } from '@/eleccion/rules-engine/rules-engine.module';
import { ListaController } from '@/eleccion/lista/controllers/lista.controller';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { BoletaService } from '@/eleccion/lista/services/boleta.service';
import { ListaService } from '@/eleccion/lista/services/lista.service';
import { OficializacionService } from '@/eleccion/lista/services/oficializacion.service';
import { ElectoralImageService } from '@/common/images/electoral-image.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Eleccion, Lista, Boleta, Categoria]),
    RulesEngineModule,
    CategoriasModule,
    PadronModule,
  ],
  controllers: [ListaController],
  providers: [
    ListaService,
    BoletaService,
    OficializacionService,
    ElectoralImageService,
  ],
  exports: [ListaService, BoletaService],
})
export class ListaModule {}

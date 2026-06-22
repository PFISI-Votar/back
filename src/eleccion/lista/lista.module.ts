import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { ListaController } from '@/eleccion/lista/controllers/lista.controller';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Lista } from '@/eleccion/lista/entities/lista.entity';
import { BoletaService } from '@/eleccion/lista/services/boleta.service';
import { ListaService } from '@/eleccion/lista/services/lista.service';
import { OficializacionService } from '@/eleccion/lista/services/oficializacion.service';

@Module({
  imports: [TypeOrmModule.forFeature([Eleccion, Lista, Boleta, Categoria])],
  controllers: [ListaController],
  providers: [ListaService, BoletaService, OficializacionService],
  exports: [ListaService, BoletaService],
})
export class ListaModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CandidatoModule } from '@/eleccion/candidato/candidato.module';
import { EleccionesController } from '@/eleccion/controllers/eleccion.controller';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { ELECCION_REPOSITORY } from '@/eleccion/interfaces/eleccion.repository.interface';
import { ListaModule } from '@/eleccion/lista/lista.module';
import { EleccionRepository } from '@/eleccion/repositories/eleccion.repository';
import { EleccionesService } from '@/eleccion/services/eleccion.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Eleccion]),
    ListaModule,
    CandidatoModule,
  ],
  controllers: [EleccionesController],
  providers: [
    EleccionesService,
    {
      provide: ELECCION_REPOSITORY,
      useClass: EleccionRepository,
    },
  ],
})
export class EleccionesModule {}

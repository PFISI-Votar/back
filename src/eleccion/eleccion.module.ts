import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Eleccion } from './entities/eleccion.entity';
import { EleccionesController } from './eleccion.controller';
import { EleccionesService } from './eleccion.service';
import { ELECCION_REPOSITORY } from './interfaces/eleccion.repository.interface';
import { EleccionRepository } from './eleccion.repository';


@Module({
  imports: [TypeOrmModule.forFeature([Eleccion])],
  controllers: [EleccionesController],
  providers: [
    EleccionesService,
    {
      provide: ELECCION_REPOSITORY,
      useClass: EleccionRepository,
    },
  ],
  exports: [ELECCION_REPOSITORY],
})
export class EleccionesModule {}
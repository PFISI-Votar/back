import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Categoria } from './entities/categoria.entity';
import { CategoriasController } from './categoria.controller';
import { CategoriasService } from './categoria.service';
import { CategoriaRepository } from './categoria.repository';
import { CATEGORIA_REPOSITORY } from './interfaces/categoria.repository.interface';
import { EleccionesModule } from '../eleccion/eleccion.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Categoria]),
    EleccionesModule, // para inyectar IEleccionRepository
  ],
  controllers: [CategoriasController],
  providers: [
    CategoriasService,
    {
      provide: CATEGORIA_REPOSITORY,
      useClass: CategoriaRepository,
    },
  ],
  exports: [CategoriasService], // exportado para que EleccionesService lo use al oficializar
})
export class CategoriasModule {}
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Categoria } from '@/eleccion/lista/entities/categoria.entity';
import { Boleta } from '@/eleccion/lista/entities/boleta.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { CategoriasController } from './categoria.controller';
import { CategoriasService } from './categoria.service';
import { CategoriaRepository } from './categoria.repository';
import { CATEGORIA_REPOSITORY } from './interfaces/categoria.repository.interface';

@Module({
  imports: [TypeOrmModule.forFeature([Categoria, Boleta, Eleccion])],
  controllers: [CategoriasController],
  providers: [
    CategoriasService,
    {
      provide: CATEGORIA_REPOSITORY,
      useClass: CategoriaRepository,
    },
  ],
  exports: [CategoriasService],
})
export class CategoriasModule {}
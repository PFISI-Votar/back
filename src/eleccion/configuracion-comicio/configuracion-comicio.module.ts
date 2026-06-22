import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { ConfiguracionComicioService } from '@/eleccion/configuracion-comicio/services/configuracion-comicio.service';

@Module({
  imports: [TypeOrmModule.forFeature([ConfiguracionComicio])],
  providers: [ConfiguracionComicioService],
  exports: [ConfiguracionComicioService],
})
export class ConfiguracionComicioModule {}

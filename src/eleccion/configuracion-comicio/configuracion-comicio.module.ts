import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '@/audit/audit.module';
import { ConfiguracionComicioController } from '@/eleccion/configuracion-comicio/controllers/configuracion-comicio.controller';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { ConfiguracionComicioService } from '@/eleccion/configuracion-comicio/services/configuracion-comicio.service';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConfiguracionComicio, Eleccion]),
    AuditModule,
  ],
  controllers: [ConfiguracionComicioController],
  providers: [ConfiguracionComicioService],
  exports: [ConfiguracionComicioService],
})
export class ConfiguracionComicioModule {}

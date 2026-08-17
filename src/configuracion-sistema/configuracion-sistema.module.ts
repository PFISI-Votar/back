import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ElectoralImageService } from '@/common/images/electoral-image.service';
import { ConfiguracionSistemaController } from '@/configuracion-sistema/configuracion-sistema.controller';
import { ConfiguracionSistemaService } from '@/configuracion-sistema/configuracion-sistema.service';
import { ConfiguracionSistema } from '@/configuracion-sistema/entities/configuracion-sistema.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ConfiguracionSistema])],
  controllers: [ConfiguracionSistemaController],
  providers: [ConfiguracionSistemaService, ElectoralImageService],
  exports: [ConfiguracionSistemaService],
})
export class ConfiguracionSistemaModule {}

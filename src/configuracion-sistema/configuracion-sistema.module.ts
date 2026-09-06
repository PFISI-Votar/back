import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ElectoralImageModule } from '@/common/images/electoral-image.module';
import { ConfiguracionSistemaController } from '@/configuracion-sistema/configuracion-sistema.controller';
import { ConfiguracionSistemaService } from '@/configuracion-sistema/configuracion-sistema.service';
import { ConfiguracionSistema } from '@/configuracion-sistema/entities/configuracion-sistema.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConfiguracionSistema]),
    ElectoralImageModule,
  ],
  controllers: [ConfiguracionSistemaController],
  providers: [ConfiguracionSistemaService],
  exports: [ConfiguracionSistemaService],
})
export class ConfiguracionSistemaModule {}

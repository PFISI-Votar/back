import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutoridadElectoral } from '@/auth/entities/autoridad-electoral.entity';
import { ElectoralImageModule } from '@/common/images/electoral-image.module';
import { ConfiguracionSistemaController } from '@/configuracion-sistema/configuracion-sistema.controller';
import { ConfiguracionSistemaService } from '@/configuracion-sistema/configuracion-sistema.service';
import { ConfiguracionSistema } from '@/configuracion-sistema/entities/configuracion-sistema.entity';

@Module({
  imports: [
    // VOTAR-492 — `@PauserAuth()` en el endpoint de bloqueo instancia
    // PauserRoleGuard (global vía AuthModule) en el scope de este módulo; sin
    // este forFeature, Nest no puede resolver el repositorio que el guard
    // inyecta (mismo motivo que en EleccionesModule, VOTAR-347).
    TypeOrmModule.forFeature([ConfiguracionSistema, AutoridadElectoral]),
    ElectoralImageModule,
  ],
  controllers: [ConfiguracionSistemaController],
  providers: [ConfiguracionSistemaService],
  exports: [ConfiguracionSistemaService],
})
export class ConfiguracionSistemaModule {}

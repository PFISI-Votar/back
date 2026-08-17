// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { CommonRateLimitModule } from '@/common/rate-limit/common-rate-limit.module';
import { BlockchainModule } from '@/blockchain/blockchain.module';
import { CategoriasModule } from '@/categoria/categoria.module';
import { getDatabaseConfig } from '@/config/database.config';
import { envValidationSchema } from '@/config/env.validation';
import { EleccionesModule } from '@/eleccion/eleccion.module';
import { EscrutinioModule } from '@/escrutinio/escrutinio.module';
import { PadronModule } from '@/padron/padron.module';
import { AuthModule } from '@/auth/auth.module';
import { VotoModule } from '@/voto/voto.module';
import { DashboardPublicoModule } from '@/dashboard-publico/dashboard-publico.module';
import { AuditModule } from '@/audit/audit.module';
import { FaucetModule } from '@/faucet/faucet.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validationSchema: envValidationSchema,
      validationOptions: { allowUnknown: true, abortEarly: true },
    }),
    CommonRateLimitModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),
    AuthModule,
    BlockchainModule,
    EleccionesModule,
    EscrutinioModule,
    PadronModule,
    VotoModule,
    DashboardPublicoModule,
    CategoriasModule,
    AuditModule,
    FaucetModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
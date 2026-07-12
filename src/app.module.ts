import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { CategoriasModule } from '@/categoria/categoria.module';
import { getDatabaseConfig } from '@/config/database.config';
import { envValidationSchema } from '@/config/env.validation';
import { EleccionesModule } from '@/eleccion/eleccion.module';
import { PadronModule } from '@/padron/padron.module';
import { AuthModule } from '@/auth/auth.module';
import { VotoModule } from '@/voto/voto.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.blockchain.local', '.env'],
      validationSchema: envValidationSchema,
      validationOptions: { allowUnknown: true, abortEarly: true },
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 segundos
        limit: 5, // 5 requests por minuto para endpoints públicos
      },
    ]),
    AuthModule,
    EleccionesModule,
    PadronModule,
    VotoModule,
    CategoriasModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

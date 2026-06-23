import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { getDatabaseConfig } from '@/config/database.config';
import { envValidationSchema } from '@/config/env.validation';
import { EleccionesModule } from '@/eleccion/eleccion.module';
import { PadronModule } from '@/padron/padron.module';
import { VotoModule } from '@/voto/voto.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: true,
      },
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),
    EleccionesModule,
    PadronModule,
    VotoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

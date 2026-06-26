import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '@/audit/audit.module';
import { AuthController } from '@/auth/auth.controller';
import { VotanteAuthController } from '@/auth/controllers/votante-auth.controller';
import { AutoridadElectoral } from '@/auth/entities/autoridad-electoral.entity';
import { RefreshSession } from '@/auth/entities/refresh-session.entity';
import { VoterElectionGuard } from '@/auth/guards/voter-election.guard';
import { VoterJwtAuthGuard } from '@/auth/guards/voter-jwt-auth.guard';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { AuthService } from '@/auth/services/auth.service';
import { AutogestionService } from '@/auth/services/autogestion.service';
import { RefreshTokenService } from '@/auth/services/refresh-token.service';
import { VotanteAuthService } from '@/auth/services/votante-auth.service';
import { JwtStrategy } from '@/auth/strategies/jwt.strategy';
import { VoterJwtStrategy } from '@/auth/strategies/voter-jwt.strategy';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { Eleccion } from '@/eleccion/entities/eleccion.entity';
import { PadronModule } from '@/padron/padron.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AutoridadElectoral,
      RefreshSession,
      Eleccion,
      ConfiguracionComicio,
    ]),
    PadronModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') ?? 'dev-secret',
        signOptions: {
          expiresIn: (configService.get<string>('JWT_ACCESS_EXPIRES_IN') ??
            configService.get<string>('JWT_EXPIRES_IN') ??
            '15m') as `${number}${'s' | 'm' | 'h' | 'd'}`,
        },
      }),
    }),
    AuditModule,
  ],
  controllers: [AuthController, VotanteAuthController],
  providers: [
    AuthService,
    VotanteAuthService,
    AutogestionService,
    RefreshTokenService,
    JwtStrategy,
    VoterJwtStrategy,
    JwtAuthGuard,
    VoterJwtAuthGuard,
    VoterElectionGuard,
    RolesGuard,
  ],
  exports: [
    AuthService,
    VotanteAuthService,
    JwtAuthGuard,
    VoterJwtAuthGuard,
    VoterElectionGuard,
    RolesGuard,
    JwtModule,
    AuditModule,
  ],
})
export class AuthModule {}

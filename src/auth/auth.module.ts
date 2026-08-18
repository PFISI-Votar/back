import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '@/audit/audit.module';
import { CommonRateLimitModule } from '@/common/rate-limit/common-rate-limit.module';
import { AuthController } from '@/auth/auth.controller';
import { JwksController } from '@/auth/controllers/jwks.controller';
import { VotanteAuthController } from '@/auth/controllers/votante-auth.controller';
import {
  DEFAULT_JWT_AUDIENCE,
  DEFAULT_JWT_ISSUER,
} from '@/auth/constants/jwt-identity.constants';
import { AutoridadElectoral } from '@/auth/entities/autoridad-electoral.entity';
import { RefreshSession } from '@/auth/entities/refresh-session.entity';
import { VoterElectionGuard } from '@/auth/guards/voter-election.guard';
import { VoterJwtAuthGuard } from '@/auth/guards/voter-jwt-auth.guard';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { PauserRoleGuard } from '@/auth/guards/pauser-role.guard';
import { AuthService } from '@/auth/services/auth.service';
import { AutogestionService } from '@/auth/services/autogestion.service';
import { JwtKeysService } from '@/auth/services/jwt-keys.service';
import { JwksService } from '@/auth/services/jwks.service';
import { RefreshTokenService } from '@/auth/services/refresh-token.service';
import { VotanteAuthService } from '@/auth/services/votante-auth.service';
import { JwtStrategy } from '@/auth/strategies/jwt.strategy';
import { VoterJwtStrategy } from '@/auth/strategies/voter-jwt.strategy';
import { resolveJwtKeyMaterial } from '@/auth/utils/jwt-key-material.util';
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
      useFactory: (configService: ConfigService) => {
        const material = resolveJwtKeyMaterial({
          privateKeyPem: configService.get<string>('JWT_PRIVATE_KEY'),
          publicKeyPem: configService.get<string>('JWT_PUBLIC_KEY'),
          kid: configService.get<string>('JWT_KID'),
        });
        return {
          privateKey: material.privateKeyPem,
          publicKey: material.publicKeyPem,
          signOptions: {
            algorithm: 'RS256' as const,
            keyid: material.kid,
            issuer:
              configService.get<string>('JWT_ISSUER') ?? DEFAULT_JWT_ISSUER,
            audience:
              configService.get<string>('JWT_AUDIENCE') ?? DEFAULT_JWT_AUDIENCE,
            expiresIn: (configService.get<string>('JWT_ACCESS_EXPIRES_IN') ??
              configService.get<string>('JWT_EXPIRES_IN') ??
              '15m') as `${number}${'s' | 'm' | 'h' | 'd'}`,
          },
          verifyOptions: {
            algorithms: ['RS256' as const],
            issuer:
              configService.get<string>('JWT_ISSUER') ?? DEFAULT_JWT_ISSUER,
            audience:
              configService.get<string>('JWT_AUDIENCE') ?? DEFAULT_JWT_AUDIENCE,
          },
        };
      },
    }),
    AuditModule,
    CommonRateLimitModule,
  ],
  controllers: [AuthController, VotanteAuthController, JwksController],
  providers: [
    AuthService,
    VotanteAuthService,
    AutogestionService,
    RefreshTokenService,
    JwtKeysService,
    JwksService,
    JwtStrategy,
    VoterJwtStrategy,
    JwtAuthGuard,
    VoterJwtAuthGuard,
    VoterElectionGuard,
    RolesGuard,
    PauserRoleGuard,
  ],
  exports: [
    AuthService,
    VotanteAuthService,
    JwtAuthGuard,
    VoterJwtAuthGuard,
    VoterElectionGuard,
    RolesGuard,
    PauserRoleGuard,
    JwtModule,
    AuditModule,
    JwtKeysService,
    JwksService,
  ],
})
export class AuthModule {}

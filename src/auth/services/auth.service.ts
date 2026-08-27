import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import {
  DEFAULT_JWT_AUDIENCE,
  DEFAULT_JWT_ISSUER,
} from '@/auth/constants/jwt-identity.constants';
import {
  TWO_FACTOR_CHALLENGE_AUDIENCE,
  TWO_FACTOR_CHALLENGE_EXPIRES_IN,
} from '@/auth/constants/two-factor.constants';
import { LoginDto } from '@/auth/dto/login.dto';
import { AuthUserDto } from '@/auth/dto/auth-response.dto';
import { TwoFactorChallengeDto } from '@/auth/dto/two-factor.dto';
import { AutoridadElectoral } from '@/auth/entities/autoridad-electoral.entity';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { JwtPayload } from '@/auth/interfaces/jwt-payload.interface';
import {
  TwoFactorChallengeMode,
  TwoFactorChallengePayload,
} from '@/auth/interfaces/two-factor-challenge.interface';
import { AutogestionService } from '@/auth/services/autogestion.service';
import { JwksService } from '@/auth/services/jwks.service';
import {
  RefreshSessionIdentity,
  RefreshTokenService,
} from '@/auth/services/refresh-token.service';
import { TotpService } from '@/auth/services/totp.service';

export type AuthTokensResponse = {
  accessToken: string;
  user: AuthUserDto;
};

export type AuthSessionResult = {
  response: AuthTokensResponse;
  refreshToken: string;
};

export type LoginAuditContext = {
  ipOrigen?: string;
};

export type LoginResult =
  | { kind: 'session'; session: AuthSessionResult }
  | { kind: 'two_factor'; twoFactor: TwoFactorChallengeDto };

@Injectable()
export class AuthService {
  constructor(
    private readonly autogestionService: AutogestionService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly jwksService: JwksService,
    private readonly auditLoggerService: AuditLoggerService,
    private readonly totpService: TotpService,
    @InjectRepository(AutoridadElectoral)
    private readonly autoridadRepository: Repository<AutoridadElectoral>,
  ) {}

  async login(
    dto: LoginDto,
    auditContext?: LoginAuditContext,
  ): Promise<LoginResult> {
    const nick = dto.nick.trim();
    const hash = await this.autogestionService.login(nick, dto.password);
    const usuario = await this.autogestionService.fetchUsuario(nick, hash);
    if (!usuario.persona) {
      throw new UnauthorizedException('Credenciales institucionales inválidas');
    }
    const persona = usuario.persona;
    const sub = persona.legajo?.toString() ?? nick;
    const email = persona.email ?? persona.mail;
    const name = [persona.nombre, persona.apellido].filter(Boolean).join(' ');
    const autoridad = await this.findAutoridad(nick, sub);
    const role = this.resolveJwtRole(autoridad);
    const identity: RefreshSessionIdentity = {
      identificadorSso: nick,
      sub,
      email: email ?? undefined,
      name: name || undefined,
    };

    // 2FA solo para autoridad electoral (panel admin). Votantes siguen sin TOTP.
    if (role === JwtRole.ELECTION_ADMIN && autoridad) {
      if (autoridad.totpEnabled && autoridad.totpSecret) {
        const challengeToken = await this.issueTwoFactorChallenge(
          identity,
          'verify',
        );
        return {
          kind: 'two_factor',
          twoFactor: {
            status: 'verification_required',
            challengeToken,
          },
        };
      }

      const secret = await this.totpService.createSecret();
      autoridad.totpSecret = secret;
      autoridad.totpEnabled = false;
      await this.autoridadRepository.save(autoridad);

      const label = email || nick;
      const otpauthUrl = await this.totpService.buildOtpauthUrl(secret, label);
      const challengeToken = await this.issueTwoFactorChallenge(
        identity,
        'setup',
      );
      return {
        kind: 'two_factor',
        twoFactor: {
          status: 'setup_required',
          challengeToken,
          otpauthUrl,
          secret,
        },
      };
    }

    return {
      kind: 'session',
      session: await this.completeSession(identity, role, auditContext),
    };
  }

  async verifyTwoFactor(
    challengeToken: string,
    code: string,
    auditContext?: LoginAuditContext,
  ): Promise<AuthSessionResult> {
    const challenge = await this.verifyTwoFactorChallenge(challengeToken);
    const autoridad = await this.findAutoridad(challenge.nick, challenge.sub);
    if (!autoridad?.totpSecret) {
      throw new UnauthorizedException('Setup 2FA inválido o incompleto');
    }

    const valid = await this.totpService.verifyCode(
      autoridad.totpSecret,
      code.trim(),
    );
    if (!valid) {
      throw new UnauthorizedException('Código 2FA inválido');
    }

    if (challenge.mode === 'setup' && !autoridad.totpEnabled) {
      autoridad.totpEnabled = true;
      await this.autoridadRepository.save(autoridad);
    }

    if (challenge.mode === 'verify' && !autoridad.totpEnabled) {
      throw new UnauthorizedException('Setup 2FA no confirmado');
    }

    const identity: RefreshSessionIdentity = {
      identificadorSso: challenge.nick,
      sub: challenge.sub,
      email: challenge.email,
      name: challenge.name,
    };
    return this.completeSession(
      identity,
      JwtRole.ELECTION_ADMIN,
      auditContext,
    );
  }

  async resetTwoFactor(
    user: JwtPayload,
    password: string,
  ): Promise<void> {
    const autoridad = await this.findAutoridadForAuthenticatedUser(user);
    if (!autoridad) {
      throw new UnauthorizedException('Autoridad electoral no encontrada');
    }

    await this.autogestionService.login(autoridad.identificadorSso, password);

    autoridad.totpSecret = null;
    autoridad.totpEnabled = false;
    await this.autoridadRepository.save(autoridad);
  }

  async getTwoFactorStatus(user: JwtPayload): Promise<{ enabled: boolean }> {
    const autoridad = await this.findAutoridadForAuthenticatedUser(user);
    return { enabled: Boolean(autoridad?.totpEnabled && autoridad.totpSecret) };
  }

  async refreshSession(refreshToken: string): Promise<AuthSessionResult> {
    const { refreshToken: nextRefreshToken, identity } =
      await this.refreshTokenService.rotateSession(refreshToken);
    const autoridad = await this.findAutoridad(
      identity.identificadorSso,
      identity.sub,
    );
    const role = this.resolveJwtRole(autoridad);
    const response = await this.buildAuthResponse(identity, role);
    return { response, refreshToken: nextRefreshToken };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }
    await this.refreshTokenService.revokeSession(refreshToken);
  }

  private async completeSession(
    identity: RefreshSessionIdentity,
    role: JwtRole,
    auditContext?: LoginAuditContext,
  ): Promise<AuthSessionResult> {
    const response = await this.buildAuthResponse(identity, role);
    const { refreshToken } =
      await this.refreshTokenService.issueSession(identity);

    await this.auditLoggerService.logLogin({
      actorId: identity.sub,
      ipOrigen: auditContext?.ipOrigen,
      role,
    });

    return { response, refreshToken };
  }

  private async issueTwoFactorChallenge(
    identity: RefreshSessionIdentity,
    mode: TwoFactorChallengeMode,
  ): Promise<string> {
    this.jwksService.assertCanIssueLocalAccessTokens();
    const payload: TwoFactorChallengePayload = {
      sub: identity.sub,
      nick: identity.identificadorSso,
      email: identity.email,
      name: identity.name,
      purpose: '2fa_challenge',
      mode,
    };
    return this.jwtService.signAsync(payload, {
      audience: TWO_FACTOR_CHALLENGE_AUDIENCE,
      issuer: DEFAULT_JWT_ISSUER,
      expiresIn: TWO_FACTOR_CHALLENGE_EXPIRES_IN,
    });
  }

  private async verifyTwoFactorChallenge(
    challengeToken: string,
  ): Promise<TwoFactorChallengePayload> {
    try {
      const payload = await this.jwtService.verifyAsync<TwoFactorChallengePayload>(
        challengeToken,
        {
          audience: TWO_FACTOR_CHALLENGE_AUDIENCE,
          issuer: DEFAULT_JWT_ISSUER,
        },
      );
      if (
        payload.purpose !== '2fa_challenge' ||
        (payload.mode !== 'setup' && payload.mode !== 'verify') ||
        !payload.sub ||
        !payload.nick
      ) {
        throw new UnauthorizedException('Desafío 2FA inválido');
      }
      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Desafío 2FA inválido o expirado');
    }
  }

  private async buildAuthResponse(
    identity: RefreshSessionIdentity,
    role: JwtRole,
  ): Promise<AuthTokensResponse> {
    this.jwksService.assertCanIssueLocalAccessTokens();
    const payload: JwtPayload = {
      sub: identity.sub,
      role,
      email: identity.email,
      name: identity.name,
    };
    const accessToken = await this.jwtService.signAsync(payload, {
      audience: DEFAULT_JWT_AUDIENCE,
      issuer: DEFAULT_JWT_ISSUER,
    });
    return {
      accessToken,
      user: {
        sub: payload.sub,
        role: payload.role,
        email: payload.email,
        name: payload.name,
      },
    };
  }

  private async findAutoridad(
    nick: string,
    sub: string,
  ): Promise<AutoridadElectoral | null> {
    if (nick === sub) {
      return this.autoridadRepository.findOne({
        where: { identificadorSso: nick },
      });
    }
    return this.autoridadRepository.findOne({
      where: [{ identificadorSso: nick }, { identificadorSso: sub }],
    });
  }

  private async findAutoridadForAuthenticatedUser(
    user: JwtPayload,
  ): Promise<AutoridadElectoral | null> {
    if (user.email) {
      return this.autoridadRepository.findOne({
        where: [
          { identificadorSso: user.sub },
          { email: user.email },
        ],
      });
    }
    return this.autoridadRepository.findOne({
      where: { identificadorSso: user.sub },
    });
  }

  /**
   * `RolAutoridad` (ELECTION_ADMIN/PAUSER/MERKLE_UPDATER) es un permiso fino
   * dentro del panel, no el filtro de acceso al panel en sí: cualquier fila
   * registrada en autoridad_electoral entra como JwtRole.ELECTION_ADMIN
   * (acceso HTTP al panel); guards específicos (p. ej. PauserRoleGuard,
   * VOTAR-347) exigen además el valor puntual de `rol` para acciones
   * sensibles como pausar. Antes de este fix, una cuenta PAUSER-only nunca
   * alcanzaba JwtRole.ELECTION_ADMIN y por lo tanto era inalcanzable.
   */
  private resolveJwtRole(autoridad: AutoridadElectoral | null): JwtRole {
    if (autoridad) {
      return JwtRole.ELECTION_ADMIN;
    }
    return JwtRole.VOTER;
  }
}

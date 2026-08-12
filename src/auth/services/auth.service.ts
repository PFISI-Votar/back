import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLoggerService } from '@/audit/audit-logger.service';
import { LoginDto } from '@/auth/dto/login.dto';
import { AuthUserDto } from '@/auth/dto/auth-response.dto';
import { AutoridadElectoral } from '@/auth/entities/autoridad-electoral.entity';
import { JwtRole } from '@/auth/enums/jwt-role.enum';
import { JwtPayload } from '@/auth/interfaces/jwt-payload.interface';
import { AutogestionService } from '@/auth/services/autogestion.service';
import { JwksService } from '@/auth/services/jwks.service';
import {
  RefreshSessionIdentity,
  RefreshTokenService,
} from '@/auth/services/refresh-token.service';

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

@Injectable()
export class AuthService {
  constructor(
    private readonly autogestionService: AutogestionService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly jwksService: JwksService,
    private readonly auditLoggerService: AuditLoggerService,
    @InjectRepository(AutoridadElectoral)
    private readonly autoridadRepository: Repository<AutoridadElectoral>,
  ) {}

  async login(
    dto: LoginDto,
    auditContext?: LoginAuditContext,
  ): Promise<AuthSessionResult> {
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
    const response = await this.buildAuthResponse(identity, role);
    const { refreshToken } =
      await this.refreshTokenService.issueSession(identity);

    // VOTAR-370: registro automático de LOGIN institucional exitoso
    await this.auditLoggerService.logLogin({
      actorId: sub,
      ipOrigen: auditContext?.ipOrigen,
      role,
    });

    return { response, refreshToken };
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
    const accessToken = await this.jwtService.signAsync(payload);
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

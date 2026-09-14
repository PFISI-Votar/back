import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import {
  AUTH_LOCKDOWN_SCOPE_KEY,
  AuthLockdownScopeValue,
} from '@/auth/decorators/auth-lockdown-scope.decorator';
import { DEFAULT_JWT_ISSUER } from '@/auth/constants/jwt-identity.constants';
import { TWO_FACTOR_CHALLENGE_AUDIENCE } from '@/auth/constants/two-factor.constants';
import {
  AuthBloqueoAlcance,
  ConfiguracionSistema,
} from '@/configuracion-sistema/entities/configuracion-sistema.entity';

const CONFIGURACION_ID = 1;
const DEFAULT_CACHE_TTL_MS = 5_000;

type BloqueoState = {
  alcance: AuthBloqueoAlcance;
};

/**
 * VOTAR-492 §12.2 (Contención — "bloqueo de flujos de autenticación SSO
 * institucionales"). Corta login y 2FA (y, en alcance TODOS, el login de
 * votantes) mientras dura un incidente.
 *
 * NUNCA corta `refresh` de sesiones ya emitidas: esa es la vía de salida real
 * del operador que activó el bloqueo (y de cualquier autoridad ya
 * autenticada) para poder volver a entrar y desactivarlo. El corte de
 * sesiones comprometidas es responsabilidad de `revocar` / `revocar-todas`
 * (`SessionAdminController`), instantáneo vía `sid` — no de este guard.
 * Tampoco bloquea `logout` ni el flujo anónimo de VOTAR-377 FASE 2.
 *
 * - Caché en proceso de 5 s sobre el singleton (endpoints rate-limited a 10/s
 *   por IP → propagación aceptable entre instancias).
 * - Fail-open: si la consulta falla, deja pasar (fail-closed encerraría a las
 *   autoridades fuera del panel justo cuando deben entrar a resolver).
 * - Break-glass: `AUTH_LOCKDOWN_ALLOWLIST` (CSV de identificadorSso) puede
 *   loguear con el bloqueo activo. Se resuelve desde `body.nick` en login y
 *   desde el claim `nick` del `challengeToken` en 2FA — ninguno de los dos
 *   pasos trae el nick del otro.
 * - El 503 público no incluye `motivo` ni `desde`: esos datos son la
 *   justificación del incidente y quedan reservados a la bitácora y al panel
 *   autenticado (`GET /configuracion-sistema`).
 */
@Injectable()
export class AuthLockdownGuard implements CanActivate {
  private readonly logger = new Logger(AuthLockdownGuard.name);
  private cache: { state: BloqueoState; expiresAt: number } | null = null;
  private readonly allowlist: Set<string>;
  private readonly cacheTtlMs: number;

  constructor(
    @InjectRepository(ConfiguracionSistema)
    private readonly repository: Repository<ConfiguracionSistema>,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {
    this.allowlist = new Set(
      (this.configService.get<string>('AUTH_LOCKDOWN_ALLOWLIST') ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    );
    const configuredTtl = Number(
      this.configService.get<string>('AUTH_LOCKDOWN_CACHE_TTL_MS'),
    );
    this.cacheTtlMs = Number.isFinite(configuredTtl)
      ? configuredTtl
      : DEFAULT_CACHE_TTL_MS;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const scope = this.reflector.getAllAndOverride<AuthLockdownScopeValue>(
      AUTH_LOCKDOWN_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!scope) {
      return true;
    }

    const state = await this.getBloqueoState();
    if (!this.scopeIsBlocked(scope, state.alcance)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    if (await this.isAllowlisted(request)) {
      this.logger.warn(
        'Acceso break-glass durante bloqueo de autenticación (AUTH_LOCKDOWN_ALLOWLIST)',
      );
      return true;
    }

    throw new ServiceUnavailableException({
      statusCode: 503,
      message:
        'Autenticación institucional temporalmente bloqueada por incidente de seguridad',
    });
  }

  private scopeIsBlocked(
    scope: AuthLockdownScopeValue,
    alcance: AuthBloqueoAlcance,
  ): boolean {
    if (alcance === 'TODOS') {
      return true;
    }
    if (alcance === 'ADMIN') {
      return scope === 'ADMIN';
    }
    return false;
  }

  private async isAllowlisted(request: Request): Promise<boolean> {
    if (this.allowlist.size === 0) {
      return false;
    }
    const nick = await this.resolveNick(request);
    return nick !== null && this.allowlist.has(nick);
  }

  /**
   * `POST /auth/login` manda `nick` en el body; `POST /auth/2fa/verify` no
   * (solo `challengeToken` + `code`), así que para ese paso el nick se
   * resuelve decodificando el claim `nick` del propio `challengeToken`
   * (mismo JWT que emite `AuthService.issueTwoFactorChallenge`).
   */
  private async resolveNick(request: Request): Promise<string | null> {
    const body = request.body as
      { nick?: unknown; challengeToken?: unknown } | undefined;
    const bodyNick = typeof body?.nick === 'string' ? body.nick.trim() : '';
    if (bodyNick.length > 0) {
      return bodyNick;
    }

    const challengeToken =
      typeof body?.challengeToken === 'string' ? body.challengeToken : '';
    if (challengeToken.length === 0) {
      return null;
    }
    try {
      const payload = await this.jwtService.verifyAsync<{ nick?: string }>(
        challengeToken,
        {
          audience: TWO_FACTOR_CHALLENGE_AUDIENCE,
          issuer: DEFAULT_JWT_ISSUER,
        },
      );
      return typeof payload.nick === 'string' && payload.nick.length > 0
        ? payload.nick
        : null;
    } catch {
      return null;
    }
  }

  private async getBloqueoState(): Promise<BloqueoState> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.state;
    }
    try {
      const config = await this.repository.findOne({
        where: { id: CONFIGURACION_ID },
      });
      const state: BloqueoState = {
        alcance: config?.authBloqueoAlcance ?? 'NINGUNO',
      };
      this.cache = { state, expiresAt: now + this.cacheTtlMs };
      return state;
    } catch (error) {
      this.logger.error(
        `No se pudo leer el estado de bloqueo de autenticación; fail-open. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { alcance: 'NINGUNO' };
    }
  }
}

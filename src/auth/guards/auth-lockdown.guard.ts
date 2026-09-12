import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import {
  AUTH_LOCKDOWN_SCOPE_KEY,
  AuthLockdownScopeValue,
} from '@/auth/decorators/auth-lockdown-scope.decorator';
import {
  AuthBloqueoAlcance,
  ConfiguracionSistema,
} from '@/configuracion-sistema/entities/configuracion-sistema.entity';

const CONFIGURACION_ID = 1;
const DEFAULT_CACHE_TTL_MS = 5_000;

type BloqueoState = {
  alcance: AuthBloqueoAlcance;
  motivo: string | null;
  desde: Date | null;
};

/**
 * VOTAR-492 §12.2 (Contención — "bloqueo de flujos de autenticación SSO
 * institucionales"). Corta login / 2FA / refresh (y, en alcance TODOS, el login
 * de votantes) mientras dura un incidente. Nunca bloquea `logout` ni el flujo
 * anónimo de VOTAR-377 FASE 2.
 *
 * - Caché en proceso de 5 s sobre el singleton (endpoints rate-limited a 10/s
 *   por IP → propagación aceptable entre instancias).
 * - Fail-open: si la consulta falla, deja pasar (fail-closed encerraría a las
 *   autoridades fuera del panel justo cuando deben entrar a resolver).
 * - Break-glass: `AUTH_LOCKDOWN_ALLOWLIST` (CSV de identificadorSso) puede
 *   loguear con el bloqueo activo.
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
    if (this.isAllowlisted(request)) {
      this.logger.warn(
        'Acceso break-glass durante bloqueo de autenticación (AUTH_LOCKDOWN_ALLOWLIST)',
      );
      return true;
    }

    throw new ServiceUnavailableException({
      statusCode: 503,
      message:
        'Autenticación institucional temporalmente bloqueada por incidente de seguridad',
      motivo: state.motivo,
      desde: state.desde ? state.desde.toISOString() : null,
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

  private isAllowlisted(request: Request): boolean {
    if (this.allowlist.size === 0) {
      return false;
    }
    const body = request.body as { nick?: unknown } | undefined;
    const nick = typeof body?.nick === 'string' ? body.nick.trim() : '';
    return nick.length > 0 && this.allowlist.has(nick);
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
        motivo: config?.authBloqueoMotivo ?? null,
        desde: config?.authBloqueoDesde ?? null,
      };
      this.cache = { state, expiresAt: now + this.cacheTtlMs };
      return state;
    } catch (error) {
      this.logger.error(
        `No se pudo leer el estado de bloqueo de autenticación; fail-open. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { alcance: 'NINGUNO', motivo: null, desde: null };
    }
  }
}

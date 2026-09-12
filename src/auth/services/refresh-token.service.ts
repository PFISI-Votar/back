import { createHash, randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { RefreshSession } from '@/auth/entities/refresh-session.entity';
import { RevocacionMotivo } from '@/auth/enums/revocacion-motivo.enum';
import { parseDurationToSeconds } from '@/auth/utils/parse-duration.util';

export type RefreshSessionIdentity = {
  identificadorSso: string;
  sub: string;
  email?: string;
  name?: string;
};

export type RefreshRotationResult = {
  refreshToken: string;
  identity: RefreshSessionIdentity;
  idSession: number;
};

export type RevokeByUserInput = {
  sub?: string;
  identificadorSso?: string;
  motivo: RevocacionMotivo;
  exceptIdSession?: number;
};

@Injectable()
export class RefreshTokenService {
  private readonly refreshTtlSeconds: number;
  private readonly idleTimeoutSeconds: number;
  private readonly activityWriteIntervalSeconds: number;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(RefreshSession)
    private readonly refreshSessionRepository: Repository<RefreshSession>,
  ) {
    this.refreshTtlSeconds = parseDurationToSeconds(
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '8h',
    );
    this.idleTimeoutSeconds = parseDurationToSeconds(
      this.configService.get<string>('SESSION_IDLE_TIMEOUT') ?? '30m',
    );
    this.activityWriteIntervalSeconds = parseDurationToSeconds(
      this.configService.get<string>('SESSION_ACTIVITY_WRITE_INTERVAL') ??
        '60s',
    );
  }

  async issueSession(
    identity: RefreshSessionIdentity,
  ): Promise<{ refreshToken: string; idSession: number }> {
    const refreshToken = this.generateRefreshToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.refreshTtlSeconds * 1000);
    const session = this.refreshSessionRepository.create({
      tokenHash: this.hashToken(refreshToken),
      identificadorSso: identity.identificadorSso,
      sub: identity.sub,
      email: identity.email ?? null,
      nombre: identity.name ?? null,
      expiresAt,
      lastActivityAt: now,
      revokedAt: null,
      revokedReason: null,
    });
    const saved = await this.refreshSessionRepository.save(session);
    return { refreshToken, idSession: saved.idSession };
  }

  /**
   * VOTAR-492: rota el `token_hash` in-place sobre la MISMA fila. Preserva
   * `id_session` (el claim `sid` del access token sigue siendo válido durante
   * toda la vida de la sesión) y `expires_at` (el tope absoluto de 8h es real,
   * no se extiende en cada refresh). NO toca `last_activity_at`: renovar el
   * access token no cuenta como actividad del usuario.
   */
  async rotateSession(refreshToken: string): Promise<RefreshRotationResult> {
    const session = await this.findActiveSession(refreshToken);
    const nextRefreshToken = this.generateRefreshToken();
    session.tokenHash = this.hashToken(nextRefreshToken);
    await this.refreshSessionRepository.save(session);
    const identity: RefreshSessionIdentity = {
      identificadorSso: session.identificadorSso,
      sub: session.sub,
      email: session.email ?? undefined,
      name: session.nombre ?? undefined,
    };
    return {
      refreshToken: nextRefreshToken,
      identity,
      idSession: session.idSession,
    };
  }

  /**
   * VOTAR-492: revocación idempotente. Devuelve `true` solo si esta llamada
   * revocó una sesión que estaba activa; `false` si el token es desconocido o
   * la sesión ya estaba revocada (no lanza). Esto permite que `/auth/logout`
   * limpie siempre las cookies.
   */
  async revokeSession(
    refreshToken: string,
    motivo: RevocacionMotivo = RevocacionMotivo.LOGOUT,
  ): Promise<boolean> {
    const session = await this.refreshSessionRepository.findOne({
      where: { tokenHash: this.hashToken(refreshToken) },
    });
    if (!session || session.revokedAt !== null) {
      return false;
    }
    session.revokedAt = new Date();
    session.revokedReason = motivo;
    await this.refreshSessionRepository.save(session);
    return true;
  }

  /**
   * VOTAR-492: verificación stateful llamada por `JwtStrategy` en cada request
   * autenticado del panel. Rechaza sesiones revocadas, expiradas o inactivas, y
   * refresca `last_activity_at` con throttle (≤ 1 UPDATE por
   * `SESSION_ACTIVITY_WRITE_INTERVAL` por sesión).
   */
  async validateActiveSession(idSession: number): Promise<RefreshSession> {
    const session = await this.refreshSessionRepository.findOne({
      where: { idSession },
    });
    if (!session || session.revokedAt !== null) {
      throw new UnauthorizedException('session_revoked');
    }
    const now = Date.now();
    if (session.expiresAt.getTime() <= now) {
      await this.markRevoked(idSession, RevocacionMotivo.EXPIRACION);
      throw new UnauthorizedException('session_revoked');
    }
    const idleMs = now - session.lastActivityAt.getTime();
    if (idleMs > this.idleTimeoutSeconds * 1000) {
      await this.markRevoked(idSession, RevocacionMotivo.INACTIVIDAD);
      throw new UnauthorizedException('session_idle');
    }
    if (idleMs > this.activityWriteIntervalSeconds * 1000) {
      const activityAt = new Date();
      await this.refreshSessionRepository.update(idSession, {
        lastActivityAt: activityAt,
      });
      session.lastActivityAt = activityAt;
    }
    return session;
  }

  async listActiveSessions(filtro?: {
    sub?: string;
    identificadorSso?: string;
  }): Promise<RefreshSession[]> {
    const where: Record<string, unknown> = { revokedAt: IsNull() };
    if (filtro?.sub) {
      where.sub = filtro.sub;
    }
    if (filtro?.identificadorSso) {
      where.identificadorSso = filtro.identificadorSso;
    }
    return this.refreshSessionRepository.find({
      where,
      order: { lastActivityAt: 'DESC' },
    });
  }

  /**
   * VOTAR-492 §12.2: revoca todas las sesiones activas de un usuario
   * (por `sub` y/o `identificadorSso`). Un solo UPDATE atómico; devuelve la
   * cantidad de filas afectadas.
   */
  async revokeSessionsByUser(input: RevokeByUserInput): Promise<number> {
    if (!input.sub && !input.identificadorSso) {
      return 0;
    }
    const qb = this.refreshSessionRepository
      .createQueryBuilder()
      .update(RefreshSession)
      .set({ revokedAt: () => 'now()', revokedReason: input.motivo })
      .where('revoked_at IS NULL');
    if (input.sub && input.identificadorSso) {
      qb.andWhere('(sub = :sub OR identificador_sso = :sso)', {
        sub: input.sub,
        sso: input.identificadorSso,
      });
    } else if (input.sub) {
      qb.andWhere('sub = :sub', { sub: input.sub });
    } else {
      qb.andWhere('identificador_sso = :sso', { sso: input.identificadorSso });
    }
    if (input.exceptIdSession !== undefined) {
      qb.andWhere('id_session != :except', { except: input.exceptIdSession });
    }
    const result = await qb.execute();
    return result.affected ?? 0;
  }

  /**
   * VOTAR-492 §12.2: revocación global de todas las sesiones activas.
   */
  async revokeAllSessions(
    motivo: RevocacionMotivo,
    exceptIdSession?: number,
  ): Promise<number> {
    const qb = this.refreshSessionRepository
      .createQueryBuilder()
      .update(RefreshSession)
      .set({ revokedAt: () => 'now()', revokedReason: motivo })
      .where('revoked_at IS NULL');
    if (exceptIdSession !== undefined) {
      qb.andWhere('id_session != :except', { except: exceptIdSession });
    }
    const result = await qb.execute();
    return result.affected ?? 0;
  }

  getRefreshTtlSeconds(): number {
    return this.refreshTtlSeconds;
  }

  getIdleTimeoutSeconds(): number {
    return this.idleTimeoutSeconds;
  }

  private async markRevoked(
    idSession: number,
    motivo: RevocacionMotivo,
  ): Promise<void> {
    await this.refreshSessionRepository.update(idSession, {
      revokedAt: new Date(),
      revokedReason: motivo,
    });
  }

  private async findActiveSession(
    refreshToken: string,
  ): Promise<RefreshSession> {
    const session = await this.refreshSessionRepository.findOne({
      where: {
        tokenHash: this.hashToken(refreshToken),
        revokedAt: IsNull(),
      },
    });
    if (!session) {
      throw new UnauthorizedException('Sesión de refresco inválida');
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.markRevoked(session.idSession, RevocacionMotivo.EXPIRACION);
      throw new UnauthorizedException('Sesión de refresco expirada');
    }
    const idleMs = Date.now() - session.lastActivityAt.getTime();
    if (idleMs > this.idleTimeoutSeconds * 1000) {
      await this.markRevoked(session.idSession, RevocacionMotivo.INACTIVIDAD);
      throw new UnauthorizedException('Sesión expirada por inactividad');
    }
    return session;
  }

  private generateRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

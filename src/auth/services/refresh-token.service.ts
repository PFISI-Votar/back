import { createHash, randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { RefreshSession } from '@/auth/entities/refresh-session.entity';
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
};

@Injectable()
export class RefreshTokenService {
  private readonly refreshTtlSeconds: number;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(RefreshSession)
    private readonly refreshSessionRepository: Repository<RefreshSession>,
  ) {
    this.refreshTtlSeconds = parseDurationToSeconds(
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '8h',
    );
  }

  async issueSession(
    identity: RefreshSessionIdentity,
  ): Promise<{ refreshToken: string }> {
    const refreshToken = this.generateRefreshToken();
    const expiresAt = new Date(Date.now() + this.refreshTtlSeconds * 1000);
    const session = this.refreshSessionRepository.create({
      tokenHash: this.hashToken(refreshToken),
      identificadorSso: identity.identificadorSso,
      sub: identity.sub,
      email: identity.email ?? null,
      nombre: identity.name ?? null,
      expiresAt,
      revokedAt: null,
    });
    await this.refreshSessionRepository.save(session);
    return { refreshToken };
  }

  async rotateSession(refreshToken: string): Promise<RefreshRotationResult> {
    const session = await this.findActiveSession(refreshToken);
    session.revokedAt = new Date();
    await this.refreshSessionRepository.save(session);
    const identity: RefreshSessionIdentity = {
      identificadorSso: session.identificadorSso,
      sub: session.sub,
      email: session.email ?? undefined,
      name: session.nombre ?? undefined,
    };
    const { refreshToken: nextRefreshToken } =
      await this.issueSession(identity);
    return { refreshToken: nextRefreshToken, identity };
  }

  async revokeSession(refreshToken: string): Promise<void> {
    const session = await this.findActiveSession(refreshToken);
    session.revokedAt = new Date();
    await this.refreshSessionRepository.save(session);
  }

  getRefreshTtlSeconds(): number {
    return this.refreshTtlSeconds;
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
      session.revokedAt = new Date();
      await this.refreshSessionRepository.save(session);
      throw new UnauthorizedException('Sesión de refresco expirada');
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

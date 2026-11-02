import { createHash, randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request, { Test } from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { RefreshSession } from '@/auth/entities/refresh-session.entity';
import { JwtRole } from '@/auth/enums/jwt-role.enum';

export const withBearer = (token: string): { Authorization: string } => ({
  Authorization: `Bearer ${token}`,
});

/**
 * @deprecated VOTAR-492: los access tokens de autoridad exigen el claim `sid`
 * verificado contra `refresh_session`. Usar {@link issueTestSessionToken}.
 */
export const signTestToken = (
  jwtService: JwtService,
  payload: {
    sub: string;
    role: JwtRole;
    email?: string;
    name?: string;
  },
): string => {
  return jwtService.sign(payload);
};

/**
 * VOTAR-492: inserta una `refresh_session` activa y firma un access token con
 * el claim `sid` correspondiente, para que `JwtStrategy.validate` lo acepte.
 */
export const issueTestSessionToken = async (
  dataSource: DataSource,
  jwtService: JwtService,
  payload: {
    sub: string;
    role: JwtRole;
    email?: string;
    name?: string;
    identificadorSso?: string;
  },
): Promise<string> => {
  const repo = dataSource.getRepository(RefreshSession);
  const session = await repo.save(
    repo.create({
      tokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
      identificadorSso: payload.identificadorSso ?? payload.sub,
      sub: payload.sub,
      email: payload.email ?? null,
      nombre: payload.name ?? null,
      expiresAt: new Date(Date.now() + 8 * 3_600 * 1000),
      lastActivityAt: new Date(),
      revokedAt: null,
      revokedReason: null,
    }),
  );
  return jwtService.sign({ ...payload, sid: session.idSession });
};

export type AuthedRequest = {
  get: (url: string) => Test;
  post: (url: string) => Test;
  patch: (url: string) => Test;
  put: (url: string) => Test;
  delete: (url: string) => Test;
};

export const createAuthedRequest = (
  app: INestApplication<App>,
  token: string,
): AuthedRequest => {
  const server = app.getHttpServer();
  return {
    get: (url: string) => request(server).get(url).set(withBearer(token)),
    post: (url: string) => request(server).post(url).set(withBearer(token)),
    patch: (url: string) => request(server).patch(url).set(withBearer(token)),
    put: (url: string) => request(server).put(url).set(withBearer(token)),
    delete: (url: string) => request(server).delete(url).set(withBearer(token)),
  };
};

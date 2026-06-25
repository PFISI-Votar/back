import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request, { Test } from 'supertest';
import { App } from 'supertest/types';
import { JwtRole } from '@/auth/enums/jwt-role.enum';

export const withBearer = (token: string): { Authorization: string } => ({
  Authorization: `Bearer ${token}`,
});

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

import type { CookieOptions, Response } from 'express';
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  VOTER_ACCESS_COOKIE_NAME,
} from '@/auth/constants/auth-cookie.constants';

type AuthCookieOptions = {
  maxAgeSeconds: number;
  secure: boolean;
};

/**
 * Política de cookies de sesión (VOTAR-487): HttpOnly + Secure en producción
 * + SameSite=Strict.
 *
 * SameSite=Strict es compatible con el SSO actual: Autogestión se invoca
 * server-side (POST /login y fetch Basic). No hay redirect OAuth en el
 * browser, así que ninguna cookie de estado tiene que sobrevivir una
 * navegación top-level cross-site desde el IdP. Las cookies se emiten en la
 * respuesta same-site de la API y solo se necesitan en requests same-site
 * posteriores. Las rutas anónimas de voto ya usan credentials:'omit'.
 */
export const AUTH_COOKIE_SAME_SITE = 'strict' as const;

const sessionCookieOptions = (secure: boolean): CookieOptions => ({
  httpOnly: true,
  secure,
  sameSite: AUTH_COOKIE_SAME_SITE,
  path: '/',
});

export const setAccessTokenCookie = (
  response: Response,
  token: string,
  options: AuthCookieOptions,
): void => {
  response.cookie(ACCESS_COOKIE_NAME, token, {
    ...sessionCookieOptions(options.secure),
    maxAge: options.maxAgeSeconds * 1000,
  });
};

export const setRefreshTokenCookie = (
  response: Response,
  token: string,
  options: AuthCookieOptions,
): void => {
  response.cookie(REFRESH_COOKIE_NAME, token, {
    ...sessionCookieOptions(options.secure),
    maxAge: options.maxAgeSeconds * 1000,
  });
};

export const clearAuthCookies = (response: Response, secure: boolean): void => {
  const cookieOptions = sessionCookieOptions(secure);
  response.clearCookie(ACCESS_COOKIE_NAME, cookieOptions);
  response.clearCookie(REFRESH_COOKIE_NAME, cookieOptions);
};

export const setVoterAccessTokenCookie = (
  response: Response,
  token: string,
  options: AuthCookieOptions,
): void => {
  response.cookie(VOTER_ACCESS_COOKIE_NAME, token, {
    ...sessionCookieOptions(options.secure),
    maxAge: options.maxAgeSeconds * 1000,
  });
};

export const clearVoterAccessCookie = (
  response: Response,
  secure: boolean,
): void => {
  response.clearCookie(VOTER_ACCESS_COOKIE_NAME, sessionCookieOptions(secure));
};

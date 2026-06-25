import type { Response } from 'express';
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
} from '@/auth/constants/auth-cookie.constants';

type AuthCookieOptions = {
  maxAgeSeconds: number;
  secure: boolean;
};

export const setAccessTokenCookie = (
  response: Response,
  token: string,
  options: AuthCookieOptions,
): void => {
  response.cookie(ACCESS_COOKIE_NAME, token, {
    httpOnly: true,
    secure: options.secure,
    sameSite: 'lax',
    path: '/',
    maxAge: options.maxAgeSeconds * 1000,
  });
};

export const setRefreshTokenCookie = (
  response: Response,
  token: string,
  options: AuthCookieOptions,
): void => {
  response.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: options.secure,
    sameSite: 'lax',
    path: '/',
    maxAge: options.maxAgeSeconds * 1000,
  });
};

export const clearAuthCookies = (response: Response, secure: boolean): void => {
  const cookieOptions = {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
  };
  response.clearCookie(ACCESS_COOKIE_NAME, cookieOptions);
  response.clearCookie(REFRESH_COOKIE_NAME, cookieOptions);
};

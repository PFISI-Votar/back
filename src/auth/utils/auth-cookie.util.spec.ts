import express, { type Response } from 'express';
import request from 'supertest';
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  VOTER_ACCESS_COOKIE_NAME,
} from '@/auth/constants/auth-cookie.constants';
import {
  clearAuthCookies,
  clearVoterAccessCookie,
  setAccessTokenCookie,
  setRefreshTokenCookie,
  setVoterAccessTokenCookie,
} from '@/auth/utils/auth-cookie.util';

const applyAndReadCookies = async (
  apply: (response: Response) => void,
): Promise<string[]> => {
  const app = express();
  app.get('/', (_req, res) => {
    apply(res);
    res.status(204).end();
  });

  const response = await request(app).get('/');
  const setCookie = response.headers['set-cookie'];
  return Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
};

const cookieNamed = (cookies: string[], name: string): string => {
  const header = cookies.find((value) => value.startsWith(`${name}=`));
  expect(header).toBeDefined();
  return header as string;
};

const expectSessionAttributes = (header: string, secure: boolean): void => {
  expect(header).toMatch(/HttpOnly/i);
  expect(header).toMatch(/SameSite=Strict/i);
  expect(header).toMatch(/Path=\//i);
  expect(header).not.toMatch(/SameSite=Lax/i);
  if (secure) {
    expect(header).toMatch(/;\s*Secure(?:;|$)/i);
  } else {
    expect(header).not.toMatch(/;\s*Secure(?:;|$)/i);
  }
};

describe('auth cookie attributes (VOTAR-487)', () => {
  it.each([
    {
      name: ACCESS_COOKIE_NAME,
      set: (response: Response, secure: boolean) =>
        setAccessTokenCookie(response, 'access-token', {
          maxAgeSeconds: 900,
          secure,
        }),
    },
    {
      name: REFRESH_COOKIE_NAME,
      set: (response: Response, secure: boolean) =>
        setRefreshTokenCookie(response, 'refresh-token', {
          maxAgeSeconds: 60 * 60 * 24 * 7,
          secure,
        }),
    },
    {
      name: VOTER_ACCESS_COOKIE_NAME,
      set: (response: Response, secure: boolean) =>
        setVoterAccessTokenCookie(response, 'voter-token', {
          maxAgeSeconds: 1800,
          secure,
        }),
    },
  ])(
    'emite $name con HttpOnly, Path=/ y SameSite=Strict',
    async ({ name, set }) => {
      for (const secure of [false, true]) {
        const cookies = await applyAndReadCookies((response) =>
          set(response, secure),
        );
        const header = cookieNamed(cookies, name);
        expect(header).toContain(`${name}=`);
        expectSessionAttributes(header, secure);
        expect(header).toMatch(/Max-Age=\d+/i);
      }
    },
  );

  it('limpia access y refresh de autoridad con los mismos atributos que la emisión', async () => {
    const cookies = await applyAndReadCookies((response) =>
      clearAuthCookies(response, true),
    );

    expect(cookies).toHaveLength(2);
    for (const name of [ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME]) {
      const header = cookieNamed(cookies, name);
      expect(header.startsWith(`${name}=;`)).toBe(true);
      expectSessionAttributes(header, true);
      expect(header).toMatch(/Expires=/i);
    }
  });

  it('limpia la cookie de votante con los mismos atributos que la emisión', async () => {
    const cookies = await applyAndReadCookies((response) =>
      clearVoterAccessCookie(response, false),
    );

    const header = cookieNamed(cookies, VOTER_ACCESS_COOKIE_NAME);
    expect(header.startsWith(`${VOTER_ACCESS_COOKIE_NAME}=;`)).toBe(true);
    expectSessionAttributes(header, false);
    expect(header).toMatch(/Expires=/i);
  });
});

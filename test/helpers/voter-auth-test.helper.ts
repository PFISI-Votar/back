import { VOTER_ACCESS_COOKIE_NAME } from '@/auth/constants/auth-cookie.constants';
import { JwtRole } from '@/auth/enums/jwt-role.enum';

export type VoterJwtPayload = {
  sub: string;
  role: JwtRole;
  votanteHash: string;
  idEleccion: number;
  email?: string;
  name?: string;
  exp?: number;
  iat?: number;
};

export const parseSetCookieHeader = (
  setCookieHeader: string[] | string | undefined,
): Record<string, string> => {
  if (!setCookieHeader) {
    return {};
  }
  const headers = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : [setCookieHeader];
  const cookies: Record<string, string> = {};
  for (const header of headers) {
    const [pair] = header.split(';');
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }
    const name = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();
    cookies[name] = value;
  }
  return cookies;
};

export const decodeJwtPayload = <T = VoterJwtPayload>(token: string): T => {
  const [, payloadSegment] = token.split('.');
  if (!payloadSegment) {
    throw new Error('JWT malformado');
  }
  const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '=',
  );
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as T;
};

export const extractVoterAccessToken = (
  setCookieHeader: string[] | string | undefined,
): string | undefined => {
  const cookies = parseSetCookieHeader(setCookieHeader);
  return cookies[VOTER_ACCESS_COOKIE_NAME];
};

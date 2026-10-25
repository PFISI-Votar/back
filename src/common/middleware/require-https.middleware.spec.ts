import type { NextFunction, Request, Response } from 'express';
import { requireHttpsMiddleware } from '@/common/middleware/require-https.middleware';

const invoke = (req: Partial<Request>): { status?: number; body?: unknown } => {
  const result: { status?: number; body?: unknown } = {};
  const res = {
    status(this: { json: (payload: unknown) => unknown }, code: number) {
      result.status = code;
      return this;
    },
    json(this: unknown, payload: unknown) {
      result.body = payload;
      return this;
    },
  };
  const next: NextFunction = () => {
    result.status = result.status ?? 200;
  };
  requireHttpsMiddleware(req as Request, res as Response, next);
  return result;
};

describe('requireHttpsMiddleware — VOTAR-378 UAT-02', () => {
  it('rechaza tráfico HTTP en claro', () => {
    const result = invoke({
      secure: false,
      headers: {},
    });

    expect(result.status).toBe(403);
    expect(result.body).toEqual({ message: 'HTTPS requerido' });
  });

  it('acepta TLS directo o el proto https del proxy', () => {
    expect(invoke({ secure: true, headers: {} }).status).toBe(200);
    expect(
      invoke({
        secure: false,
        headers: { 'x-forwarded-proto': 'https' },
      }).status,
    ).toBe(200);
  });
});

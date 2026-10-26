import { EventEmitter } from 'events';
import type { NextFunction, Request, Response } from 'express';
import { createServerMetrics } from '@/common/middleware/server-metrics.middleware';

interface Window {
  requests: number;
  errors5xx: number;
  avgMs: number;
  maxMs: number;
  rssMb: number;
  heapUsedMb: number;
}

const windowAt = (log: jest.Mock, call: number): Window =>
  JSON.parse((log.mock.calls[call] as [string])[0]) as Window;

const fakeResponse = (statusCode: number): Response => {
  const res = new EventEmitter() as unknown as Response;
  res.statusCode = statusCode;
  return res;
};

describe('createServerMetrics — VOTAR-512', () => {
  let handle: ReturnType<typeof createServerMetrics>;
  const log = jest.fn();

  beforeEach(() => {
    log.mockClear();
    handle = createServerMetrics({ intervalMs: 60_000, logger: { log } });
  });

  afterEach(() => handle.stop());

  const run = (statusCode: number): void => {
    const res = fakeResponse(statusCode);
    const next: NextFunction = jest.fn();
    handle.middleware({} as Request, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    res.emit('finish');
  };

  it('agrega conteo, errores 5xx y memoria en el log de la ventana', () => {
    run(200);
    run(201);
    run(500);

    handle.flush();

    const payload = windowAt(log, 0);
    expect(payload.requests).toBe(3);
    expect(payload.errors5xx).toBe(1);
    expect(payload.avgMs).toBeGreaterThanOrEqual(0);
    expect(payload.rssMb).toBeGreaterThan(0);
    expect(payload.heapUsedMb).toBeGreaterThan(0);
  });

  it('reinicia los contadores tras cada flush', () => {
    run(200);
    handle.flush();
    handle.flush();

    const payload = windowAt(log, 1);
    expect(payload.requests).toBe(0);
    expect(payload.maxMs).toBe(0);
  });
});

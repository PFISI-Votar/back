import { EventEmitter } from 'events';
import type { NextFunction, Request, Response } from 'express';
import { createServerMetrics } from '@/common/middleware/server-metrics.middleware';

interface Window {
  pid: number;
  host: string;
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

  it('cuenta una sola vez el request que emite finish y close', () => {
    const res = fakeResponse(200);
    handle.middleware({} as Request, res, jest.fn());
    res.emit('finish');
    res.emit('close');

    handle.flush();

    expect(windowAt(log, 0).requests).toBe(1);
  });

  it('cuenta el request abortado por el cliente (close sin finish)', () => {
    const res = fakeResponse(200);
    handle.middleware({} as Request, res, jest.fn());
    res.emit('close');

    handle.flush();

    const payload = windowAt(log, 0);
    expect(payload.requests).toBe(1);
    expect(payload.errors5xx).toBe(0);
  });

  it('considera error 5xx desde el status 500 inclusive', () => {
    run(499);
    run(500);

    handle.flush();

    expect(windowAt(log, 0).errors5xx).toBe(1);
  });

  it('incluye pid y host en el log', () => {
    handle.flush();

    const payload = windowAt(log, 0);
    expect(payload.pid).toBe(process.pid);
    expect(payload.host).toEqual(expect.any(String));
  });

  it('conserva decimales en maxMs para latencias sub-milisegundo', () => {
    const hr = jest.spyOn(process.hrtime, 'bigint');
    hr.mockReturnValueOnce(0n).mockReturnValueOnce(800_000n);
    run(200);
    hr.mockRestore();

    handle.flush();

    expect(windowAt(log, 0).maxMs).toBe(0.8);
  });

  it('emite el log por timer al cumplirse la ventana', () => {
    jest.useFakeTimers();
    try {
      const timed = createServerMetrics({ intervalMs: 1_000, logger: { log } });
      jest.advanceTimersByTime(1_000);
      expect(log).toHaveBeenCalledTimes(1);
      timed.stop();
      jest.advanceTimersByTime(5_000);
      expect(log).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

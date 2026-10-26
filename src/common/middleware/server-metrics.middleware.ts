import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

export interface ServerMetricsOptions {
  intervalMs: number;
  logger?: Pick<Logger, 'log'>;
}

export interface ServerMetricsHandle {
  middleware: (req: Request, res: Response, next: NextFunction) => void;
  flush: () => void;
  stop: () => void;
}

const NS_PER_MS = 1_000_000n;
const BYTES_PER_MB = 1024 * 1024;

/**
 * VOTAR-512 — métricas operativas por ventana: conteo de requests, tiempo de
 * procesamiento (avg/max) y memoria. El costo por request se limita a dos
 * lecturas de hrtime y a actualizar contadores; la memoria se muestrea una
 * sola vez por ventana, al emitir el log agregado.
 */
export const createServerMetrics = ({
  intervalMs,
  logger = new Logger('ServerMetrics'),
}: ServerMetricsOptions): ServerMetricsHandle => {
  let count = 0;
  let errors = 0;
  let totalNs = 0n;
  let maxNs = 0n;

  const flush = (): void => {
    const { rss, heapUsed } = process.memoryUsage();
    const avgMs = count > 0 ? Number(totalNs / BigInt(count)) / 1e6 : 0;
    logger.log(
      JSON.stringify({
        windowMs: intervalMs,
        requests: count,
        errors5xx: errors,
        avgMs: Number(avgMs.toFixed(2)),
        maxMs: Number(maxNs / NS_PER_MS),
        rssMb: Math.round(rss / BYTES_PER_MB),
        heapUsedMb: Math.round(heapUsed / BYTES_PER_MB),
      }),
    );
    count = 0;
    errors = 0;
    totalNs = 0n;
    maxNs = 0n;
  };

  const timer = setInterval(flush, intervalMs);
  timer.unref();

  const middleware = (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const start = process.hrtime.bigint();
    res.once('finish', () => {
      const elapsed = process.hrtime.bigint() - start;
      count += 1;
      totalNs += elapsed;
      if (elapsed > maxNs) maxNs = elapsed;
      if (res.statusCode >= 500) errors += 1;
    });
    next();
  };

  return { middleware, flush, stop: () => clearInterval(timer) };
};

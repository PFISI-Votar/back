import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { RATE_LIMIT_METADATA_KEY } from '@/common/rate-limit/rate-limit.constants';
import { RateLimitOptions } from '@/common/rate-limit/rate-limit-options.interface';
import { RateLimitConfigService } from '@/common/rate-limit/rate-limit.config';
import { IpRateLimitStore } from '@/common/rate-limit/ip-rate-limit.store';
import { resolveClientIp } from '@/common/utils/resolve-client-ip.util';

@Injectable()
export class IpRateLimitGuard implements CanActivate {
  constructor(
    private readonly store: IpRateLimitStore,
    private readonly rateLimitConfig: RateLimitConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const policy = this.rateLimitConfig.resolvePolicy(options);
    const clientIp = resolveClientIp(request);
    const bucket = options.bucket ?? options.tier;
    const bucketKey = `${clientIp}:${bucket}`;
    const result = this.store.checkAndRecord(
      bucketKey,
      policy.maxAttempts,
      policy.windowMs,
    );
    if (!result.allowed) {
      response.setHeader('Retry-After', String(result.retryAfterSeconds));
      throw new HttpException(policy.message, HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}

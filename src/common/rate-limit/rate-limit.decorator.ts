import { SetMetadata } from '@nestjs/common';
import { RATE_LIMIT_METADATA_KEY } from '@/common/rate-limit/rate-limit.constants';
import { RateLimitOptions } from '@/common/rate-limit/rate-limit-options.interface';

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_METADATA_KEY, options);

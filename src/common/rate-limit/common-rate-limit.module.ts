import { Global, Module } from '@nestjs/common';
import { RateLimitConfigService } from '@/common/rate-limit/rate-limit.config';
import { IpRateLimitGuard } from '@/common/rate-limit/ip-rate-limit.guard';
import { IpRateLimitStore } from '@/common/rate-limit/ip-rate-limit.store';

@Global()
@Module({
  providers: [IpRateLimitStore, RateLimitConfigService, IpRateLimitGuard],
  exports: [IpRateLimitStore, RateLimitConfigService, IpRateLimitGuard],
})
export class CommonRateLimitModule {}

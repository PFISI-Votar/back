import { Injectable } from '@nestjs/common';
import * as OTPAuth from 'otpauth';
import { TWO_FACTOR_ISSUER } from '@/auth/constants/two-factor.constants';

@Injectable()
export class TotpService {
  createSecret(): string {
    return new OTPAuth.Secret({ size: 20 }).base32;
  }

  buildOtpauthUrl(secret: string, label: string): string {
    return this.createTotp(secret, label).toString();
  }

  verifyCode(secret: string, token: string): boolean {
    const delta = this.createTotp(secret).validate({
      token: token.trim(),
      window: 1,
    });
    return delta !== null;
  }

  /** Solo para tests: genera el código actual de un secreto. */
  generateCode(secret: string): string {
    return this.createTotp(secret).generate();
  }

  private createTotp(secret: string, label = 'admin'): OTPAuth.TOTP {
    return new OTPAuth.TOTP({
      issuer: TWO_FACTOR_ISSUER,
      label,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
  }
}

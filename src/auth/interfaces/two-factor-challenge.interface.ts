export type TwoFactorChallengeMode = 'setup' | 'verify';

export interface TwoFactorChallengePayload {
  sub: string;
  nick: string;
  email?: string;
  name?: string;
  purpose: '2fa_challenge';
  mode: TwoFactorChallengeMode;
}

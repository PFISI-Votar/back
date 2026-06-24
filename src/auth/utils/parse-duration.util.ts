const DURATION_MULTIPLIERS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

export const parseDurationToSeconds = (duration: string): number => {
  const match = /^(\d+)([smhd])$/i.exec(duration.trim());
  if (!match) {
    return 3600;
  }
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = DURATION_MULTIPLIERS[unit];
  if (!multiplier) {
    return 3600;
  }
  return value * multiplier;
};

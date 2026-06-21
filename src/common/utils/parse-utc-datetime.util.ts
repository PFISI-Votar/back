import { isUtcIso8601DateTime } from '@/common/validators/is-utc-iso8601.decorator';

export const parseUtcDateTime = (value: string): Date => {
  if (!isUtcIso8601DateTime(value)) {
    throw new Error(`Invalid UTC datetime: ${String(value)}`);
  }

  return new Date(value.trim());
};

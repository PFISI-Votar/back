import { isUtcIso8601DateTime } from '@/common/validators/is-utc-iso8601.decorator';
import { parseUtcDateTime } from '@/common/utils/parse-utc-datetime.util';

describe('UTC datetime validation', () => {
  it('accepts ISO strings with explicit timezone', () => {
    expect(isUtcIso8601DateTime('2026-06-20T17:30:00.000Z')).toBe(true);
    expect(isUtcIso8601DateTime('2026-06-20T14:30:00-03:00')).toBe(true);
  });

  it('rejects timezone-less ISO strings', () => {
    expect(isUtcIso8601DateTime('2026-06-20T14:30')).toBe(false);
  });

  it('parses valid UTC ISO strings into Date instances', () => {
    const parsed = parseUtcDateTime('2026-06-20T17:30:00.000Z');

    expect(parsed.toISOString()).toBe('2026-06-20T17:30:00.000Z');
  });
});

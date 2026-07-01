import { validate } from 'class-validator';
import {
  IsUtcIso8601,
  isUtcIso8601DateTime,
} from '@/common/validators/is-utc-iso8601.decorator';
import { parseUtcDateTime } from '@/common/utils/parse-utc-datetime.util';

class FechaUtcDto {
  @IsUtcIso8601()
  fecha!: string;
}

describe('UTC datetime validation', () => {
  it('accepts ISO strings with explicit timezone', () => {
    expect(isUtcIso8601DateTime('2026-06-20T17:30:00.000Z')).toBe(true);
    expect(isUtcIso8601DateTime('2026-06-20T14:30:00-03:00')).toBe(true);
  });

  it('rejects timezone-less ISO strings', () => {
    expect(isUtcIso8601DateTime('2026-06-20T14:30')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isUtcIso8601DateTime(123)).toBe(false);
    expect(isUtcIso8601DateTime(null)).toBe(false);
  });

  it('exposes a decorator message for invalid values', async () => {
    const dto = new FechaUtcDto();
    dto.fecha = '2026-06-20T14:30';

    const errors = await validate(dto);

    expect(errors[0]?.constraints?.isUtcIso8601).toContain(
      'zona horaria explícita',
    );
  });

  it('parses valid UTC ISO strings into Date instances', () => {
    const parsed = parseUtcDateTime('2026-06-20T17:30:00.000Z');

    expect(parsed.toISOString()).toBe('2026-06-20T17:30:00.000Z');
  });
});

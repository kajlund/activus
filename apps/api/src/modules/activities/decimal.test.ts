import { describe, expect, it } from 'vitest';
import {
  decimal,
  decimalString,
  multiply,
  compare,
  divideForDisplay,
} from './decimal.js';
describe('exact bounded decimals', () => {
  it.each(['0', '-0', '0.100000', '-123.456', '9007199254740990.123456'])(
    'normalizes %s without number conversion',
    (input) => {
      const value = decimal(input);
      expect(compare(value, decimal(decimalString(value)))).toBe(0);
    },
  );
  it('converts exact units and avoids binary multiplication', () => {
    expect(decimalString(multiply(decimal('0.1'), decimal(1000)))).toBe('100');
    expect(decimalString(multiply(decimal('1'), decimal(1609.344)))).toBe(
      '1609.344',
    );
    expect(decimalString(multiply(decimal('1'), decimal(0.45359237)))).toBe(
      '0.45359237',
    );
    expect(decimalString(decimal(1e-7))).toBe('0.0000001');
  });
  it.each([
    '1e3',
    ' 1 ',
    '+1',
    '01',
    '.5',
    '1.',
    'NaN',
    'Infinity',
    '0x10',
    '1,000',
    '1.2 km',
    '0.' + '1'.repeat(25),
    '1'.repeat(49),
  ])('rejects unsupported string boundary %s', (v) =>
    expect(() => decimal(v)).toThrow(),
  );
  it.each([NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects %s',
    (v) => expect(() => decimal(v)).toThrow(),
  );
  it('rounds only display values, including negative ties', () => {
    expect(divideForDisplay(decimal('1'), decimal('3'), 6)).toBe('0.333333');
    expect(divideForDisplay(decimal('-1.005'), decimal('1'), 2)).toBe('-1.01');
    expect(divideForDisplay(decimal('1000'), decimal('1000'), 2)).toBe('1');
  });
});

// Bounded base-ten arithmetic: no binary floating-point conversion of string inputs.
export interface Decimal {
  coefficient: bigint;
  scale: number;
}
const power = (n: number) => 10n ** BigInt(n);
function normalize(coefficient: bigint, scale: number): Decimal {
  while (scale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n;
    scale--;
  }
  return { coefficient, scale };
}
export function decimal(value: string | number): Decimal {
  if (
    typeof value === 'number' &&
    (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)
  )
    throw new RangeError('Invalid decimal');
  let str = String(value);
  // Number inputs mean their JavaScript shortest decimal representation. Strings never accept exponents.
  if (typeof value === 'number' && /e/i.test(str)) {
    const [mantissa = '', exponent = '0'] = str.split('e');
    const negative = mantissa.startsWith('-');
    const unsigned = negative ? mantissa.slice(1) : mantissa;
    const [whole = '', fraction = ''] = unsigned.split('.');
    const digits = whole + fraction;
    const point = whole.length + Number(exponent);
    str =
      (negative ? '-' : '') +
      (point <= 0
        ? '0.' + '0'.repeat(-point) + digits
        : point >= digits.length
          ? digits + '0'.repeat(point - digits.length)
          : digits.slice(0, point) + '.' + digits.slice(point));
  }
  if (str.length > 48 || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(str))
    throw new RangeError('Invalid decimal');
  const [whole = '', fraction = ''] = str.split('.');
  if (fraction.length > 24) throw new RangeError('Decimal scale exceeded');
  return normalize(BigInt(whole + fraction), fraction.length);
}
export function decimalString(v: Decimal): string {
  const negative = v.coefficient < 0n;
  const digits = (negative ? -v.coefficient : v.coefficient)
    .toString()
    .padStart(v.scale + 1, '0');
  return (
    (negative ? '-' : '') +
    (v.scale
      ? digits.slice(0, -v.scale) + '.' + digits.slice(-v.scale)
      : digits)
  );
}
export function multiply(a: Decimal, b: Decimal): Decimal {
  return normalize(a.coefficient * b.coefficient, a.scale + b.scale);
}
export function compare(a: Decimal, b: Decimal): number {
  const delta = a.coefficient * power(b.scale) - b.coefficient * power(a.scale);
  return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}
// Display-only rounding, half away from zero. Canonical writes are never rounded.
export function divideForDisplay(
  a: Decimal,
  b: Decimal,
  precision: number,
): string {
  const numerator = a.coefficient * power(b.scale + precision);
  const denominator = b.coefficient * power(a.scale);
  let result = numerator / denominator;
  const remainder = numerator % denominator;
  if ((remainder < 0n ? -remainder : remainder) * 2n >= denominator)
    result += numerator < 0n ? -1n : 1n;
  return decimalString(normalize(result, precision));
}

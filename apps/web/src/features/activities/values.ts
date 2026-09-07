import {
  ActivityMeasurementInputSchema,
  ExactDecimalSchema,
  measurementUnits,
  type ActivityMeasurementInput,
  type MeasurementDefinition,
} from '@activus/contracts';

// Decimal arithmetic at the input boundary: never round a user's value to make
// it fit a definition. Precision and bounds are defined in canonical units.
function decimal(raw: string) {
  let source = raw;
  if (/e/i.test(source)) {
    const [mantissa = '', exponent = '0'] = source.toLowerCase().split('e');
    const [whole = '', fraction = ''] = mantissa.split('.');
    const scale = fraction.length - Number(exponent);
    return normalize(
      BigInt(whole + fraction) * 10n ** BigInt(Math.max(0, -scale)),
      Math.max(0, scale),
    );
  }
  source = ExactDecimalSchema.parse(source);
  const [whole = '', fraction = ''] = source.split('.');
  return normalize(BigInt(whole + fraction), fraction.length);
}
function normalize(n: bigint, scale: number) {
  while (scale > 0 && n % 10n === 0n) {
    n /= 10n;
    scale--;
  }
  return { n, scale };
}
function compare(a: ReturnType<typeof decimal>, b: ReturnType<typeof decimal>) {
  const scale = Math.max(a.scale, b.scale);
  const x = a.n * 10n ** BigInt(scale - a.scale);
  const y = b.n * 10n ** BigInt(scale - b.scale);
  return x < y ? -1 : x > y ? 1 : 0;
}
function stringify({ n, scale }: ReturnType<typeof decimal>) {
  const digits = (n < 0n ? -n : n).toString().padStart(scale + 1, '0');
  return `${n < 0n ? '-' : ''}${scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits}`;
}
export function measurementInput(
  d: MeasurementDefinition,
  raw: string,
): ActivityMeasurementInput | undefined {
  if (!raw.trim()) return undefined;
  const base = { measurementDefinitionId: d.id, valueType: d.valueType };
  if (d.valueType === 'text')
    return ActivityMeasurementInputSchema.parse({ ...base, value: raw });
  if (d.valueType === 'boolean') {
    if (raw !== 'true' && raw !== 'false') throw new Error('Choose Yes or No.');
    return {
      measurementDefinitionId: d.id,
      valueType: 'boolean',
      value: raw === 'true',
    };
  }
  // Accept a single decimal comma; grouping separators are deliberately invalid.
  const unit = measurementUnits.find((u) => u.id === d.displayUnit);
  let numeric = raw.trim().replace(',', '.');
  if (unit?.id === 'hour-minute') {
    if (!/^\d+:[0-5]\d(?::[0-5]\d)?$/.test(numeric))
      throw new Error(
        'Use hours:minutes or hours:minutes:seconds, for example 1:25:00.',
      );
    const [hours = '', minutes = '', seconds = ''] = numeric.split(':');
    numeric = String(durationSeconds(hours, minutes, seconds));
  }
  const value = decimal(ExactDecimalSchema.parse(numeric));
  const factor = decimal(String(unit?.factorToCanonical ?? 1));
  const canonical = normalize(value.n * factor.n, value.scale + factor.scale);
  const precision = d.valueType === 'decimal' ? (d.precision ?? 0) : 0;
  if (canonical.scale > precision)
    throw new Error(
      `Use a value representable with ${precision} decimal places in ${d.canonicalUnit ?? 'canonical units'}.`,
    );
  if (
    compare(
      canonical,
      decimal(
        String(
          d.minimumValue ??
            (d.valueType === 'duration' ? 0 : -Number.MAX_SAFE_INTEGER),
        ),
      ),
    ) < 0 ||
    compare(
      canonical,
      decimal(String(d.maximumValue ?? Number.MAX_SAFE_INTEGER)),
    ) > 0 ||
    compare(canonical, decimal(String(Number.MAX_SAFE_INTEGER))) > 0 ||
    compare(canonical, decimal(String(-Number.MAX_SAFE_INTEGER))) < 0
  )
    throw new Error('Value is outside the permitted range.');
  return ActivityMeasurementInputSchema.parse({
    ...base,
    value:
      d.valueType === 'decimal' ? stringify(canonical) : Number(canonical.n),
    ...(d.canonicalUnit ? { unitId: d.canonicalUnit } : {}),
  });
}
export function durationSeconds(
  hours: string,
  minutes: string,
  seconds: string,
): number | null {
  if (![hours, minutes, seconds].some((v) => v !== '')) return null;
  if (
    [hours, minutes, seconds].some((v) => v !== '' && !/^\d+$/.test(v)) ||
    Number(minutes) > 59 ||
    Number(seconds) > 59
  )
    throw new Error(
      'Use whole hours, minutes from 0 to 59, and seconds from 0 to 59.',
    );
  const value =
    BigInt(hours || '0') * 3600n +
    BigInt(minutes || '0') * 60n +
    BigInt(seconds || '0');
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('Duration is too large.');
  return Number(value);
}
export function splitDuration(value: number | null): [string, string, string] {
  return value === null
    ? ['', '', '']
    : [
        String(Math.floor(value / 3600)),
        String(Math.floor((value % 3600) / 60)),
        String(value % 60),
      ];
}
export function localDate(date = new Date()) {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function localInstant(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  return `${localDate(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}
export function startInstant(
  raw: string,
  occurrence: 'earlier' | 'later' = 'earlier',
): string | null {
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(raw))
    throw new Error('Enter a valid local date and time.');
  const date = new Date(raw);
  const normalized =
    raw.length === 16
      ? `${raw}:00.000`
      : raw.length === 19
        ? `${raw}.000`
        : raw.padEnd(23, '0');
  if (
    !Number.isFinite(date.getTime()) ||
    localInstant(date.toISOString()) !== normalized
  )
    throw new Error(
      'This local time does not exist. Check the date and daylight-saving time change.',
    );
  if (occurrence === 'later') {
    // Search the offset-change window, including half-hour DST transitions.
    for (let minutes = 1; minutes <= 180; minutes++) {
      const candidate = new Date(
        date.getTime() + minutes * 60000,
      ).toISOString();
      if (localInstant(candidate) === normalized) return candidate;
    }
  }
  return date.toISOString();
}

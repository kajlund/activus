import { measurementUnits, type ActivityMeasurement } from '@activus/contracts';
export function journalDate(iso: string, locale?: string) {
  const date = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}
export function startTime(iso: string, locale?: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso));
}
export function startDateTime(iso: string, locale?: string) {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso));
}
export function duration(value: number, locale?: string) {
  const number = new Intl.NumberFormat(locale);
  const h = Math.floor(value / 3600),
    m = Math.floor((value % 3600) / 60),
    s = value % 60;
  return [
    h ? `${number.format(h)} h` : '',
    m ? `${number.format(m)} min` : '',
    s || (!h && !m) ? `${number.format(s)} s` : '',
  ]
    .filter(Boolean)
    .join(' ');
}
// Format the server's decimal string without coercion to an imprecise Number.
export function exactNumber(value: string, locale?: string) {
  const [whole = '0', fraction] = value.split('.');
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const decimal =
    new Intl.NumberFormat(locale)
      .formatToParts(1.1)
      .find((p) => p.type === 'decimal')?.value ?? '.';
  const digits = Array.from({ length: 10 }, (_, i) => nf.format(i));
  const negativeZero =
    whole === '-0'
      ? (new Intl.NumberFormat(locale)
          .formatToParts(-1)
          .find((p) => p.type === 'minusSign')?.value ?? '-')
      : '';
  return `${negativeZero}${nf.format(BigInt(whole))}${fraction ? decimal + [...fraction].map((d) => digits[Number(d)]).join('') : ''}`;
}
export function measurementText(
  value: ActivityMeasurement,
  locale?: string,
): { text: string; label: string } {
  if (value.valueType === 'boolean')
    return {
      text: value.canonicalValue ? 'Yes' : 'No',
      label: value.canonicalValue ? 'Yes' : 'No',
    };
  if (value.valueType === 'text')
    return { text: value.canonicalValue, label: value.canonicalValue };
  if (value.valueType === 'duration' && value.displayUnit === 'hour-minute')
    return {
      text: duration(value.canonicalValue, locale),
      label: duration(value.canonicalValue, locale),
    };
  const unit = measurementUnits.find((u) => u.id === value.displayUnit);
  const number = exactNumber(value.displayValue, locale);
  return {
    text: `${number}${unit ? `\u00a0${unit.symbol}` : ''}`,
    label: `${number}${unit ? ` ${unit.label}` : ''}`,
  };
}

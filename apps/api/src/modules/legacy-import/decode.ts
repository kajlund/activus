import { decimal, decimalString } from '../activities/decimal.js';
import type {
  AddIssue,
  DecodedActivity,
  DecodedKind,
  RawDocument,
} from './types.js';
import { numberFields } from './types.js';

export const object = (v: unknown): v is RawDocument =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const only = (v: unknown, key: string): v is RawDocument =>
  object(v) && Object.keys(v).length === 1 && Object.hasOwn(v, key);
export const sourceId = (v: unknown): string | null =>
  only(v, '$oid') && typeof v.$oid === 'string' && /^[0-9a-f]{24}$/.test(v.$oid)
    ? v.$oid
    : null;
export function instant(v: unknown, allowString: boolean): string {
  if (
    allowString &&
    typeof v === 'string' &&
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\+00$/.test(v)
  ) {
    const iso = v.replace(' ', 'T').replace(/\+00$/, 'Z');
    if (new Date(iso).toISOString() === iso && iso >= '0001-01-01') return iso;
  }
  if (
    only(v, '$date') &&
    only(v.$date, '$numberLong') &&
    typeof v.$date.$numberLong === 'string' &&
    /^-?(?:0|[1-9]\d*)$/.test(v.$date.$numberLong)
  ) {
    const n = BigInt(v.$date.$numberLong);
    if (n >= -62135596800000n && n <= 253402300799999n)
      return new Date(Number(n)).toISOString();
  }
  throw new Error('Invalid observed date representation');
}
export function numeric(v: unknown): string {
  if (
    only(v, '$numberInt') &&
    typeof v.$numberInt === 'string' &&
    /^-?(?:0|[1-9]\d*)$/.test(v.$numberInt)
  ) {
    const n = BigInt(v.$numberInt);
    if (n >= -2147483648n && n <= 2147483647n)
      return decimalString(decimal(v.$numberInt));
  }
  if (only(v, '$numberDouble') && typeof v.$numberDouble === 'string')
    return decimalString(decimal(v.$numberDouble));
  throw new Error('Unsupported numeric representation');
}
function fields(raw: RawDocument, allowed: readonly string[], add: AddIssue) {
  if (Object.keys(raw).some((key) => !allowed.includes(key)))
    add(
      'error',
      'UNMAPPED_FIELD',
      '[unmapped]',
      'Unrecognized source field; review the record without logging its contents.',
    );
}
function reader(raw: RawDocument, add: AddIssue) {
  let invalid = false;
  return {
    get invalid() {
      return invalid;
    },
    read<T>(field: string, parse: (v: unknown) => T): T | undefined {
      try {
        return parse(raw[field]);
      } catch {
        invalid = true;
        add(
          'error',
          field === '_id' ? 'SOURCE_ID_INVALID' : 'FIELD_INVALID',
          field,
          'Missing or invalid value for the documented source field.',
        );
        return undefined;
      }
    },
  };
}
const text =
  (max: number, empty = true) =>
  (v: unknown): string => {
    if (typeof v !== 'string' || v.trim().length > max || (!empty && !v.trim()))
      throw new Error('Invalid text');
    return v.trim();
  };
const id = (v: unknown): string => {
  const parsed = sourceId(v);
  if (!parsed) throw new Error('Invalid ID');
  return parsed;
};
export function decodeKind(
  raw: RawDocument,
  add: AddIssue,
): DecodedKind | null {
  fields(
    raw,
    [
      '_id',
      'kindId',
      'name',
      'iconName',
      'description',
      'createdAt',
      'updatedAt',
    ],
    add,
  );
  const r = reader(raw, add);
  const decoded = {
    id: r.read('_id', id),
    name: r.read('name', text(120, false)),
    iconName: r.read('iconName', text(120, false)),
    legacyKindId: r.read('kindId', text(120, false)),
    description: r.read('description', text(10000)),
    createdAt: r.read('createdAt', (v) => instant(v, true)),
    updatedAt: r.read('updatedAt', (v) => instant(v, true)),
  };
  for (const field of ['createdAt', 'updatedAt'])
    if (typeof raw[field] === 'string' && !r.invalid)
      add(
        'warning',
        'METADATA_STRING_NORMALIZED',
        field,
        'Explicit UTC kind timestamp normalized to ISO milliseconds.',
      );
  return r.invalid ? null : (decoded as DecodedKind);
}
export function decodeActivity(
  raw: RawDocument,
  add: AddIssue,
): DecodedActivity | null {
  fields(
    raw,
    [
      '_id',
      'kindId',
      'userId',
      'when',
      'title',
      'description',
      'createdAt',
      'updatedAt',
      '__v',
      ...numberFields,
    ],
    add,
  );
  const r = reader(raw, add);
  const numbers: DecodedActivity['numbers'] = {};
  for (const field of numberFields) {
    if (
      Object.hasOwn(raw, field) ||
      ['distance', 'duration', 'calories'].includes(field)
    ) {
      const value = r.read(field, numeric);
      if (value !== undefined) numbers[field] = value;
    }
  }
  const decoded = {
    id: r.read('_id', id),
    kindId: r.read('kindId', id),
    ownerPresent: Object.hasOwn(raw, 'userId'),
    when: r.read('when', (v) => instant(v, false)),
    title: r.read('title', text(200)),
    notes: r.read('description', text(10000)),
    createdAt: r.read('createdAt', (v) => instant(v, false)),
    updatedAt: r.read('updatedAt', (v) => instant(v, false)),
    numbers,
  };
  if (decoded.ownerPresent) r.read('userId', text(120, false));
  if (Object.hasOwn(raw, '__v'))
    r.read('__v', (v) => {
      if (!only(v, '$numberInt')) throw new Error('Invalid version');
      return numeric(v);
    });
  return r.invalid ? null : (decoded as DecodedActivity);
}

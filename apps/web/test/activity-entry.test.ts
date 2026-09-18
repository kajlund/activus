import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LitElement } from 'lit';
import { ActivityEditorPage } from '../src/features/activities/page.js';
import { ActivityTagPicker } from '../src/features/activities/tag-picker.js';
import { ClientError } from '../src/services/configuration-api.js';
import {
  durationSeconds,
  splitDuration,
  localDate,
  localInstant,
  startInstant,
  measurementInput,
  activityStartTime,
  activityStartInstant,
} from '../src/features/activities/values.js';
import { editorFixture, validMeasurement } from './support/activity-editor.js';
import {
  CreateActivityRequestSchema,
  type MeasurementDefinition,
} from '@activus/contracts';

let fixture: Awaited<ReturnType<typeof editorFixture>>;
beforeEach(async () => {
  fixture = await editorFixture();
  history.replaceState(null, '', '/activities/new');
});
afterEach(() => {
  document.body.replaceChildren();
  history.replaceState(null, '', '/');
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
async function settle(el: LitElement) {
  for (let i = 0; i < 120; i++) await Promise.resolve();
  await el.updateComplete;
}
async function page(route = '/activities/new') {
  const el = new ActivityEditorPage();
  el.api = fixture.api;
  el.route = route;
  document.body.append(el);
  await settle(el);
  return el;
}
function field(el: LitElement, id: string) {
  return el.shadowRoot!.querySelector<HTMLInputElement>(`#${id}`)!;
}
async function input(
  el: LitElement,
  id: string,
  value: string,
  event = 'input',
) {
  if (id === 'activityKindId' || id === 'activityVariantId') {
    const name = id === 'activityKindId' ? 'activityKind' : 'activityVariant';
    el.shadowRoot!.querySelector<HTMLInputElement>(
      `input[name="${name}"][value="${value}"]`,
    )!.click();
    await settle(el);
    return;
  }
  field(el, id).value = value;
  field(el, id).dispatchEvent(new Event(event, { bubbles: true }));
  await settle(el);
}
async function selectKind(el: ActivityEditorPage) {
  await input(el, 'activityKindId', fixture.kind.id, 'change');
}
async function save(el: ActivityEditorPage) {
  el.shadowRoot!.querySelector('form')!.dispatchEvent(
    new Event('submit', { cancelable: true }),
  );
  await settle(el);
}
async function existing() {
  return fixture.api.createActivity(
    CreateActivityRequestSchema.parse({
      activityKindId: fixture.kind.id,
      activityVariantId: fixture.variant.id,
      activityDate: '2026-09-06',
      startedAt: '2026-09-06T21:42:31.123Z',
      durationSeconds: 3661,
      notes: 'First line\nSecond line',
      effort: 3,
      feeling: 4,
      measurements: [
        {
          measurementDefinitionId: fixture.distance.id,
          valueType: 'decimal',
          value: '1234.56',
        },
      ],
      tagIds: [fixture.tag.id],
    }),
  );
}
it('loads new entry without inventing a kind or measurement; selection applies configured default', async () => {
  const el = await page();
  expect(
    el.shadowRoot!.querySelector('input[name=activityKind]:checked'),
  ).toBeNull();
  expect(field(el, 'activityDate').value).toBe(localDate());
  expect(el.dirty).toBe(false);
  await selectKind(el);
  expect(
    el.shadowRoot!.querySelector<HTMLInputElement>(
      'input[name=activityVariant]:checked',
    )!.value,
  ).toBe(fixture.variant.id);
  expect(field(el, `m-${fixture.distance.id}`).value).toBe('');
  expect(el.shadowRoot!.textContent).toContain('km');
});
it('renders an actionable empty-kind state without enabling saving', async () => {
  fixture.deps.activityKinds.rows.clear();
  const el = await page();
  expect(el.shadowRoot!.textContent).toContain('No active activity kinds');
  expect(
    el.shadowRoot!.querySelector<HTMLButtonElement>('[type=submit]')!.disabled,
  ).toBe(true);
});
it('handles loading, a failed dependency and explicit read retry', async () => {
  const fail = vi
    .spyOn(fixture.api, 'listTags')
    .mockRejectedValueOnce(new ClientError('network', 'NETWORK_ERROR'));
  const el = await page();
  expect(el.shadowRoot!.textContent).toContain('server could not be reached');
  expect(el.shadowRoot!.querySelector('form')).toBeNull();
  await el.load();
  await settle(el);
  expect(fail).toHaveBeenCalledTimes(2);
  expect(el.shadowRoot!.querySelector('form')).not.toBeNull();
});
it('shows not-found while editing without an empty editable form', async () => {
  const el = await page(`/activities/${crypto.randomUUID()}/edit`);
  expect(el.shadowRoot!.textContent).toContain('could not be found');
  expect(el.shadowRoot!.querySelector('form')).toBeNull();
});
it('validates required fields with focus, invalid date, duration and notes', async () => {
  const el = await page();
  await save(el);
  expect(el.shadowRoot!.activeElement).toBe(field(el, 'activityKindId'));
  await selectKind(el);
  await input(el, 'minutes', '60');
  await input(el, 'notes', 'a'.repeat(10001));
  await save(el);
  expect(field(el, 'hours').getAttribute('aria-invalid')).toBe('true');
  expect(field(el, 'notes').getAttribute('aria-invalid')).toBe('true');
  expect(
    field(el, `m-${fixture.distance.id}`).getAttribute('aria-invalid'),
  ).toBe('true');
});
it('creates through real API with exact canonical values, duration and multiline notes', async () => {
  const el = await page();
  await selectKind(el);
  await input(el, `m-${fixture.distance.id}`, '1,23456');
  await input(el, 'hours', '0');
  await input(el, 'minutes', '25');
  await input(el, 'notes', ' A note\nNext line ');
  await save(el);
  const id = location.pathname.split('/')[2]!;
  const a = await fixture.api.getActivity(id);
  expect(a.measurements[0]?.canonicalValue).toBe('1234.56');
  expect(a.durationSeconds).toBe(1500);
  expect(a.notes).toBe('A note\nNext line');
  expect(el.dirty).toBe(false);
});
it('retains values across variant changes, restores them and excludes incompatible values on save', async () => {
  const el = await page();
  await selectKind(el);
  await input(el, `m-${fixture.distance.id}`, '2');
  await input(el, 'activityVariantId', fixture.otherVariant.id, 'change');
  await input(el, `m-${fixture.incline.id}`, '4');
  await input(el, 'activityVariantId', fixture.variant.id, 'change');
  expect(field(el, `m-${fixture.incline.id}`)).toBeNull();
  expect(el.shadowRoot!.textContent).toContain('Kept while you edit');
  await input(el, 'activityVariantId', fixture.otherVariant.id, 'change');
  expect(field(el, `m-${fixture.incline.id}`).value).toBe('4');
  await input(el, 'activityVariantId', fixture.variant.id, 'change');
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await save(el);
  const a = await fixture.api.getActivity(location.pathname.split('/')[2]!);
  expect(a.measurements.map((m) => m.measurementDefinitionId)).toEqual([
    fixture.distance.id,
  ]);
});
it('keeps hidden values when permanent-discard confirmation is cancelled', async () => {
  const el = await page();
  await selectKind(el);
  await input(el, `m-${fixture.distance.id}`, '2');
  await input(el, 'activityVariantId', fixture.otherVariant.id, 'change');
  await input(el, `m-${fixture.incline.id}`, '4');
  await input(el, 'activityVariantId', '', 'change');
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  const create = vi.spyOn(fixture.api, 'createActivity');
  await save(el);
  expect(create).not.toHaveBeenCalled();
  expect(el.dirty).toBe(true);
});
it('preserves exact stored values and timestamps on edits without resubmitting unchanged metadata', async () => {
  const a = await existing();
  const el = await page(`/activities/${a.id}/edit`);
  expect(field(el, 'seconds').value).toBe('1');
  expect(field(el, 'notes').value).toBe(a.notes);
  const patch = vi.spyOn(fixture.api, 'updateActivity');
  await input(el, 'notes', 'Changed');
  await save(el);
  expect(patch.mock.calls[0]?.[1]).toEqual({ notes: 'Changed' });
  const next = await fixture.api.getActivity(a.id);
  expect(next.startedAt).toBe(a.startedAt);
  expect(next.measurements[0]?.canonicalValue).toBe('1234.56');
  expect(next.effort).toBe(3);
});
it('keeps rounded display values exact when another measurement changes', async () => {
  const a = await existing();
  await fixture.deps.measurements.create(fixture.kind.id, {
    ...validMeasurement,
    name: 'Extra',
    isRequired: false,
  });
  const el = await page(`/activities/${a.id}/edit`);
  const extra = [...fixture.deps.measurements.rows.values()].find(
    (d) => d.name === 'Extra',
  )!;
  await input(el, `m-${extra.id}`, '1');
  await save(el);
  expect(
    (await fixture.api.getActivity(a.id)).measurements.find(
      (m) => m.measurementDefinitionId === fixture.distance.id,
    )?.canonicalValue,
  ).toBe('1234.56');
});
it('retains archived kind, variant, measurement and tags while editing', async () => {
  const a = await existing();
  fixture.deps.activityKinds.rows.get(fixture.kind.id)!.archivedAt = new Date();
  fixture.deps.variants.rows.get(fixture.variant.id)!.archivedAt = new Date();
  fixture.deps.measurements.rows.get(fixture.distance.id)!.archivedAt =
    new Date();
  fixture.deps.tags.rows.get(fixture.tag.id)!.archivedAt = new Date();
  const el = await page(`/activities/${a.id}/edit`);
  expect(
    el.shadowRoot!.querySelector<HTMLInputElement>(
      'input[name=activityKind]:checked',
    )!.value,
  ).toBe(fixture.kind.id);
  expect(field(el, 'activityVariantId').disabled).toBe(true);
  expect(el.shadowRoot!.textContent).toContain('Archived');
  const picker = el.shadowRoot!.querySelector<ActivityTagPicker>(
    'activity-tag-picker',
  )!;
  await settle(picker);
  expect(picker.shadowRoot!.textContent).toContain('Commute (archived)');
  expect(
    picker.shadowRoot!.querySelectorAll('input[type=checkbox]'),
  ).toHaveLength(1);
  await input(el, 'notes', 'Historical');
  await save(el);
  expect((await fixture.api.getActivity(a.id)).tags).toHaveLength(1);
});
it('hides variants for a kind without them and clears incompatible selection', async () => {
  const k = await fixture.api.createKind({
    name: 'Stretching',
    iconName: 'activity',
    color: '#67318F',
    sortOrder: 1,
  });
  const el = await page();
  await selectKind(el);
  await input(el, 'activityKindId', k.id, 'change');
  expect(field(el, 'activityVariantId')).toBeNull();
  await save(el);
  expect(
    (await fixture.api.getActivity(location.pathname.split('/')[2]!))
      .activityVariantId,
  ).toBeNull();
});
it('does not let stale measurement responses override the latest selection', async () => {
  const el = await page();
  await selectKind(el);
  const original = fixture.api.listMeasurements.bind(fixture.api);
  let release!: () => void;
  const wait = new Promise<void>((r) => {
    release = r;
  });
  vi.spyOn(fixture.api, 'listMeasurements').mockImplementation(
    async (kind, archived, variant, signal) => {
      if (variant === fixture.otherVariant.id) await wait;
      return original(kind, archived, variant, signal);
    },
  );
  await input(el, 'activityVariantId', fixture.otherVariant.id, 'change');
  await input(el, 'activityVariantId', fixture.variant.id, 'change');
  release();
  await settle(el);
  expect(field(el, `m-${fixture.incline.id}`)).toBeNull();
  expect(field(el, `m-${fixture.distance.id}`)).not.toBeNull();
});
it('preserves input after configuration failure and retries safely', async () => {
  const el = await page();
  await selectKind(el);
  await input(el, `m-${fixture.distance.id}`, '8');
  vi.spyOn(fixture.api, 'listMeasurements').mockRejectedValueOnce(
    new ClientError('network', 'NETWORK_ERROR'),
  );
  await input(el, 'activityVariantId', fixture.otherVariant.id, 'change');
  expect(
    el.shadowRoot!.querySelector<HTMLButtonElement>('[type=submit]')!.disabled,
  ).toBe(true);
  const retry = [...el.shadowRoot!.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === 'Retry configuration',
  )!;
  retry.click();
  await settle(el);
  expect(field(el, `m-${fixture.distance.id}`).value).toBe('8');
});
it('maps structured missing-definition errors to fields and preserves failed saves', async () => {
  const el = await page();
  await selectKind(el);
  await input(el, `m-${fixture.distance.id}`, '1');
  vi.spyOn(fixture.api, 'createActivity').mockRejectedValueOnce(
    new ClientError(
      'validation',
      'ACTIVITY_REQUIRED_MEASUREMENT_MISSING',
      crypto.randomUUID(),
      { missingDefinitionIds: [fixture.distance.id] },
    ),
  );
  await save(el);
  expect(field(el, `m-${fixture.distance.id}`).value).toBe('1');
  expect(el.shadowRoot!.activeElement).toBe(
    field(el, `m-${fixture.distance.id}`),
  );
  expect(el.dirty).toBe(true);
});
it('prevents duplicate submissions and never automatically retries a failed save', async () => {
  const el = await page();
  await selectKind(el);
  await input(el, `m-${fixture.distance.id}`, '1');
  let reject!: (e: unknown) => void;
  const saveCall = vi.spyOn(fixture.api, 'createActivity').mockImplementation(
    () =>
      new Promise((_, r) => {
        reject = r;
      }),
  );
  await save(el);
  await save(el);
  expect(saveCall).toHaveBeenCalledTimes(1);
  expect(field(el, 'notes').closest('fieldset')!.disabled).toBe(true);
  reject(new ClientError('network', 'TIMEOUT'));
  await settle(el);
  expect(saveCall).toHaveBeenCalledTimes(1);
  expect(field(el, `m-${fixture.distance.id}`).value).toBe('1');
});
it('warns on dirty internal navigation and unload, but not pristine navigation', async () => {
  const el = await page();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  expect(
    window.dispatchEvent(
      new Event('before-route-change', { cancelable: true }),
    ),
  ).toBe(true);
  await input(el, 'notes', 'Keep');
  expect(
    window.dispatchEvent(
      new Event('before-route-change', { cancelable: true }),
    ),
  ).toBe(false);
  expect(confirm).toHaveBeenCalledOnce();
  expect(
    window.dispatchEvent(new Event('beforeunload', { cancelable: true })),
  ).toBe(false);
});
it('tag selection searches, avoids duplicates, and allows removal outside the picker list', async () => {
  const el = await page();
  const picker = el.shadowRoot!.querySelector<ActivityTagPicker>(
    'activity-tag-picker',
  )!;
  await settle(picker);
  const check = picker.shadowRoot!.querySelector<HTMLInputElement>(
    'input[type=checkbox]',
  )!;
  check.click();
  await settle(el);
  await settle(picker);
  check.dispatchEvent(new Event('change'));
  await settle(el);
  expect(picker.selected).toHaveLength(1);
  picker.shadowRoot!.querySelector<HTMLButtonElement>('button')!.click();
  await settle(el);
  expect(picker.selected).toHaveLength(0);
});
it.each([
  ['', '', '', null],
  ['0', '25', '', 1500],
  ['1', '25', '1', 5101],
  ['0', '0', '0', 0],
])('duration %s/%s/%s serializes exactly', (h, m, s, expected) => {
  expect(durationSeconds(String(h), String(m), String(s))).toBe(expected);
});
it.each([
  ['-1', '0', ''],
  ['0', '60', ''],
  ['1.5', '', ''],
  ['', '', '60'],
  ['9007199254740991', '', ''],
])('rejects invalid duration %s/%s/%s', (h, m, s) => {
  expect(() => durationSeconds(h, m, s)).toThrow();
});
it('round-trips second precision and a separate calendar date', () => {
  expect(splitDuration(3661)).toEqual(['1', '1', '1']);
  expect(localDate(new Date(2026, 0, 2, 0, 30))).toBe('2026-01-02');
  const instant = '2026-02-02T10:30:21.123Z';
  expect(startInstant(localInstant(instant))).toBe(instant);
});
it('uses exact decimal conversion, constraints, booleans, text and canonical integer precision', () => {
  const definition = {
    ...validMeasurement,
    id: crypto.randomUUID(),
    activityKindId: fixture.kind.id,
    isArchived: false,
    createdAt: '',
    updatedAt: '',
  } satisfies MeasurementDefinition;
  expect(measurementInput(definition, '0.00001')?.value).toBe('0.01');
  expect(() => measurementInput(definition, '0.000001')).toThrow();
  expect(() => measurementInput(definition, '-1')).toThrow();
  expect(() => measurementInput(definition, '1,000,000')).toThrow();
  expect(
    measurementInput(
      {
        ...definition,
        valueType: 'boolean',
        canonicalUnit: null,
        displayUnit: null,
      },
      'false',
    )?.value,
  ).toBe(false);
  expect(
    measurementInput({ ...definition, valueType: 'text' }, ' A\nB ')?.value,
  ).toBe('A\nB');
});

it('renders and saves all configured value types including false, zero and a duration', async () => {
  const definitions = await Promise.all([
    fixture.deps.measurements.create(fixture.kind.id, {
      ...validMeasurement,
      name: 'Count',
      valueType: 'integer',
      canonicalUnit: 'count',
      displayUnit: 'count',
      precision: 0,
      sortOrder: 1,
    }),
    fixture.deps.measurements.create(fixture.kind.id, {
      ...validMeasurement,
      name: 'Time',
      valueType: 'duration',
      canonicalUnit: 'second',
      displayUnit: 'hour-minute',
      precision: null,
      sortOrder: 2,
    }),
    fixture.deps.measurements.create(fixture.kind.id, {
      ...validMeasurement,
      name: 'Rating',
      valueType: 'rating',
      canonicalUnit: null,
      displayUnit: null,
      precision: null,
      minimumValue: 1,
      maximumValue: 5,
      aggregation: 'average',
      sortOrder: 3,
    }),
    fixture.deps.measurements.create(fixture.kind.id, {
      ...validMeasurement,
      name: 'Boolean',
      valueType: 'boolean',
      canonicalUnit: null,
      displayUnit: null,
      precision: null,
      minimumValue: null,
      maximumValue: null,
      aggregation: 'none',
      personalBestDirection: 'none',
      sortOrder: 4,
    }),
    fixture.deps.measurements.create(fixture.kind.id, {
      ...validMeasurement,
      name: 'Text',
      valueType: 'text',
      canonicalUnit: null,
      displayUnit: null,
      precision: null,
      minimumValue: null,
      maximumValue: null,
      aggregation: 'none',
      personalBestDirection: 'none',
      sortOrder: 5,
    }),
  ]);
  const el = await page();
  await selectKind(el);
  await input(el, `m-${fixture.distance.id}`, '0');
  for (const [index, value] of [
    '0',
    '1:25:01',
    '5',
    'false',
    ' A note ',
  ].entries())
    await input(
      el,
      `m-${definitions[index]!.id}`,
      value,
      index === 3 ? 'change' : 'input',
    );
  await save(el);
  const a = await fixture.api.getActivity(location.pathname.split('/')[2]!);
  expect(a.measurements.map((m) => m.canonicalValue)).toEqual([
    '0',
    0,
    5101,
    5,
    false,
    'A note',
  ]);
  const edit = await page(`/activities/${a.id}/edit`);
  expect(field(edit, `m-${definitions[1]!.id}`).value).toBe('1:25:01');
  expect(field(edit, `m-${definitions[3]!.id}`).value).toBe('false');
});
it('rejects rating bounds, noninteger counts and short-text overflow near their controls', async () => {
  const rating = await fixture.deps.measurements.create(fixture.kind.id, {
    ...validMeasurement,
    name: 'Rating',
    valueType: 'rating',
    canonicalUnit: null,
    displayUnit: null,
    precision: null,
    minimumValue: 1,
    maximumValue: 5,
    aggregation: 'average',
  });
  const el = await page();
  await selectKind(el);
  await input(el, `m-${fixture.distance.id}`, '1');
  await input(el, `m-${rating.id}`, '6');
  await save(el);
  expect(field(el, `m-${rating.id}`).getAttribute('aria-invalid')).toBe('true');
  const d = {
    ...validMeasurement,
    id: crypto.randomUUID(),
    activityKindId: fixture.kind.id,
    isArchived: false,
    createdAt: '',
    updatedAt: '',
  } satisfies MeasurementDefinition;
  expect(() =>
    measurementInput(
      {
        ...d,
        valueType: 'integer',
        canonicalUnit: 'count',
        displayUnit: 'count',
      },
      '1.2',
    ),
  ).toThrow();
  expect(() =>
    measurementInput({ ...d, valueType: 'text' }, 'a'.repeat(501)),
  ).toThrow();
  expect(() => measurementInput(d, '1e1000000')).toThrow();
});
it('preserves an edit after an update failure and requires an explicit retry', async () => {
  const a = await existing();
  const el = await page(`/activities/${a.id}/edit`);
  const update = vi
    .spyOn(fixture.api, 'updateActivity')
    .mockRejectedValueOnce(
      new ClientError(
        'conflict',
        'ACTIVITY_WRITE_CONFLICT',
        crypto.randomUUID(),
      ),
    );
  await input(el, 'notes', 'Keep this edit');
  await save(el);
  expect(update).toHaveBeenCalledOnce();
  expect(field(el, 'notes').value).toBe('Keep this edit');
  expect(el.dirty).toBe(true);
  await save(el);
  expect(update).toHaveBeenCalledTimes(2);
  expect((await fixture.api.getActivity(a.id)).notes).toBe('Keep this edit');
});
it('retains an original archived variant when switching away and back to its archived kind', async () => {
  const a = await existing();
  const other = await fixture.api.createKind({
    name: 'Other',
    iconName: 'activity',
    color: '#67318F',
    sortOrder: 1,
  });
  fixture.deps.activityKinds.rows.get(fixture.kind.id)!.archivedAt = new Date();
  fixture.deps.variants.rows.get(fixture.variant.id)!.archivedAt = new Date();
  const el = await page(`/activities/${a.id}/edit`);
  await input(el, 'activityKindId', other.id, 'change');
  await input(el, 'activityKindId', fixture.kind.id, 'change');
  expect(
    el.shadowRoot!.querySelector<HTMLInputElement>(
      'input[name=activityVariant]:checked',
    )!.value,
  ).toBe(fixture.variant.id);
  expect(field(el, `m-${fixture.distance.id}`).value).toBe(
    a.measurements[0]?.displayValue,
  );
});
it('allows partial history to stay partial while preserving untouched metadata', async () => {
  const a = await fixture.api.createActivity(
    CreateActivityRequestSchema.parse({
      activityKindId: fixture.kind.id,
      activityDate: '2020-01-01',
      isPartial: true,
      measurements: [],
    }),
  );
  const el = await page(`/activities/${a.id}/edit`);
  await input(el, 'notes', 'Historical context');
  await save(el);
  expect((await fixture.api.getActivity(a.id)).isPartial).toBe(true);
});
it('opens optional details before focusing an invalid field', async () => {
  const el = await page();
  await selectKind(el);
  await input(el, `m-${fixture.distance.id}`, '1');
  await input(el, 'name', 'a'.repeat(201));
  await save(el);
  expect(
    el
      .shadowRoot!.querySelector('#activity-trigger')!
      .getAttribute('aria-expanded'),
  ).toBe('true');
  expect(el.shadowRoot!.activeElement).toBe(field(el, 'name'));
});
it('removes an archived tag and does not offer it as a new selection', async () => {
  const a = await existing();
  fixture.deps.tags.rows.get(fixture.tag.id)!.archivedAt = new Date();
  const el = await page(`/activities/${a.id}/edit`);
  const picker = el.shadowRoot!.querySelector<ActivityTagPicker>(
    'activity-tag-picker',
  )!;
  await settle(picker);
  picker.shadowRoot!.querySelector<HTMLButtonElement>('button')!.click();
  await settle(el);
  await save(el);
  expect((await fixture.api.getActivity(a.id)).tags).toEqual([]);
  expect(picker.tags.some((t) => t.id === fixture.tag.id)).toBe(false);
});

it('ignores a completed save after the editor has disconnected', async () => {
  const stored = await existing();
  const el = await page();
  await selectKind(el);
  await input(el, 'm-' + fixture.distance.id, '1');
  let complete!: (value: typeof stored) => void;
  vi.spyOn(fixture.api, 'createActivity').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  await save(el);
  el.remove();
  const push = vi.spyOn(history, 'pushState');
  complete(stored);
  await settle(el);
  expect(push).not.toHaveBeenCalled();
});

async function overallDuration(required = true) {
  return fixture.deps.measurements.create(fixture.kind.id, {
    ...validMeasurement,
    name: 'Duration',
    valueType: 'duration',
    canonicalUnit: 'second',
    displayUnit: 'hour-minute',
    precision: null,
    isRequired: required,
  });
}
it('uses Timing as the only duration entry, mirrors seconds and retains specialised durations', async () => {
  const duration = await overallDuration();
  const moving = await fixture.deps.measurements.create(fixture.kind.id, {
    ...validMeasurement,
    name: 'Moving time',
    valueType: 'duration',
    canonicalUnit: 'second',
    displayUnit: 'hour-minute',
    precision: null,
  });
  const el = await page();
  await selectKind(el);
  expect(field(el, 'm-' + duration.id)).toBeNull();
  expect(field(el, 'm-' + moving.id)).not.toBeNull();
  await input(el, 'm-' + fixture.distance.id, '4.86');
  await save(el);
  expect(field(el, 'hours').getAttribute('aria-invalid')).toBe('true');
  expect(
    el
      .shadowRoot!.querySelector('#timing-trigger')!
      .getAttribute('aria-expanded'),
  ).toBe('true');
  await input(el, 'hours', '1');
  await input(el, 'minutes', '2');
  await input(el, 'seconds', '18');
  await input(el, 'm-' + moving.id, '0:59:30');
  await save(el);
  const a = await fixture.api.getActivity(location.pathname.split('/')[2]!);
  expect(a.durationSeconds).toBe(3738);
  expect(
    a.measurements.find((m) => m.measurementDefinitionId === duration.id)
      ?.canonicalValue,
  ).toBe(3738);
  expect(
    a.measurements.find((m) => m.measurementDefinitionId === moving.id)
      ?.canonicalValue,
  ).toBe(3570);
});
it('maps measurement-only historical duration into Timing and preserves it on save', async () => {
  const duration = await overallDuration();
  const a = await fixture.api.createActivity(
    CreateActivityRequestSchema.parse({
      activityKindId: fixture.kind.id,
      activityDate: '2026-09-17',
      measurements: [
        {
          measurementDefinitionId: duration.id,
          valueType: 'duration',
          value: 3738,
          unitId: 'second',
        },
        {
          measurementDefinitionId: fixture.distance.id,
          valueType: 'decimal',
          value: '4860',
        },
      ],
    }),
  );
  const el = await page('/activities/' + a.id + '/edit');
  expect(field(el, 'hours').value).toBe('1');
  expect(field(el, 'seconds').value).toBe('18');
  expect(el.dirty).toBe(false);
  await input(el, 'notes', 'Preserved');
  await save(el);
  const stored = await fixture.api.getActivity(a.id);
  expect(stored.durationSeconds).toBe(3738);
  expect(
    stored.measurements.find((m) => m.measurementDefinitionId === duration.id)
      ?.canonicalValue,
  ).toBe(3738);
});
it('preserves conflicting historical durations until Timing is explicitly changed, then synchronizes', async () => {
  const duration = await overallDuration();
  const a = await fixture.api.createActivity(
    CreateActivityRequestSchema.parse({
      activityKindId: fixture.kind.id,
      activityDate: '2026-09-17',
      durationSeconds: 3601,
      measurements: [
        {
          measurementDefinitionId: duration.id,
          valueType: 'duration',
          value: 3500,
          unitId: 'second',
        },
        {
          measurementDefinitionId: fixture.distance.id,
          valueType: 'decimal',
          value: '4860',
        },
      ],
    }),
  );
  const el = await page('/activities/' + a.id + '/edit');
  await input(el, 'm-' + fixture.distance.id, '5');
  await save(el);
  let stored = await fixture.api.getActivity(a.id);
  expect(stored.durationSeconds).toBe(3601);
  expect(
    stored.measurements.find((m) => m.measurementDefinitionId === duration.id)
      ?.canonicalValue,
  ).toBe(3500);
  el.remove();
  const edit = await page('/activities/' + a.id + '/edit');
  await input(edit, 'seconds', '18');
  await save(edit);
  stored = await fixture.api.getActivity(a.id);
  expect(stored.durationSeconds).toBe(3618);
  expect(
    stored.measurements.find((m) => m.measurementDefinitionId === duration.id)
      ?.canonicalValue,
  ).toBe(3618);
});
it('derives changed start times from the activity day in Helsinki independently of browser timezone', async () => {
  expect(activityStartTime('2026-09-06T21:42:31.123Z')).toBe('00:42');
  expect(activityStartInstant('2026-09-17', '18:15')).toBe(
    '2026-09-17T15:15:00.000Z',
  );
  expect(activityStartInstant('2026-10-25', '03:30')).toBe(
    '2026-10-25T00:30:00.000Z',
  );
  expect(() => activityStartInstant('2026-03-29', '03:30')).toThrow(
    'does not exist',
  );
  expect(() => activityStartInstant('2026-09-17', '18:15:20')).toThrow();
  const a = await existing();
  const el = await page('/activities/' + a.id + '/edit');
  expect(field(el, 'start').type).toBe('time');
  expect(field(el, 'start').step).toBe('60');
  await input(el, 'activityDate', '2026-09-18');
  await input(el, 'start', '18:15');
  await save(el);
  expect((await fixture.api.getActivity(a.id)).startedAt).toBe(
    '2026-09-18T15:15:00.000Z',
  );
});

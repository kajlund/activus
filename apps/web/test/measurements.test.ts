import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LitElement } from 'lit';
import { measurementUnits, type MeasurementFields } from '@activus/contracts';
import { MeasurementForm } from '../src/features/measurements/form.js';
import { MeasurementSection } from '../src/features/measurements/section.js';
import {
  defaults,
  validateFields,
  compatibleUnits,
  canonicalBound,
  displayBound,
} from '../src/features/measurements/fields.js';
import {
  MemoryConfigurationApi,
  kindInput,
} from './support/configuration-api.js';
import {
  ClientError,
  createConfigurationApi,
} from '../src/services/configuration-api.js';
let api: MemoryConfigurationApi;
beforeEach(() => {
  api = new MemoryConfigurationApi();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
async function settle(el: LitElement) {
  await el.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await el.updateComplete;
}
function button(root: ShadowRoot | Element, name: string) {
  const el = [...root.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === name,
  );
  if (!el) throw new Error(`Missing ${name}`);
  return el;
}
function set(
  form: MeasurementForm,
  id: string,
  value: string,
  event = 'input',
) {
  const el = form.shadowRoot!.querySelector<
    HTMLInputElement | HTMLSelectElement
  >(`#${id}`)!;
  el.value = value;
  el.dispatchEvent(new Event(event, { bubbles: true }));
}
async function form() {
  const el = new MeasurementForm();
  el.units = [...measurementUnits];
  el.owner = 'Applies to Walking and every variant';
  document.body.append(el);
  await settle(el);
  return el;
}
async function section(variantId?: string) {
  const kind = api.kinds[0] ?? (await api.createKind(kindInput));
  const el = new MeasurementSection();
  el.kind = kind;
  el.api = api;
  el.kindApi = api;
  el.variant = api.variants.find((v) => v.id === variantId);
  el.route = `/activity-kinds/${kind.id}`;
  document.body.append(el);
  await settle(el);
  return el;
}
const submit = (el: MeasurementForm) =>
  el
    .shadowRoot!.querySelector('form')!
    .dispatchEvent(new Event('submit', { cancelable: true }));

it.each([
  'decimal',
  'integer',
  'duration',
  'rating',
  'boolean',
  'text',
] as const)(
  'creates %s with only compatible fields and a typed payload',
  async (type) => {
    const el = await form();
    set(el, 'name', 'Example');
    set(el, 'valueType', type, 'change');
    await settle(el);
    const saved = vi.fn();
    el.addEventListener('save-measurement', saved);
    submit(el);
    await settle(el);
    expect(saved).toHaveBeenCalledOnce();
    const fields = (saved.mock.calls[0]![0] as CustomEvent<MeasurementFields>)
      .detail;
    expect(
      el.shadowRoot!.querySelector<HTMLSelectElement>('#valueType')!.value,
    ).toBe(type);
    if (type === 'duration')
      expect(
        el.shadowRoot!.querySelector<HTMLSelectElement>('#displayUnit')!.value,
      ).toBe('hour-minute');
    expect(fields).toMatchObject({ ...defaults(type), name: 'Example' });
    expect(Boolean(el.shadowRoot!.querySelector('#precision'))).toBe(
      type === 'decimal',
    );
    expect(Boolean(el.shadowRoot!.querySelector('#displayUnit'))).toBe(
      ['decimal', 'integer', 'duration'].includes(type),
    );
    expect(Boolean(el.shadowRoot!.querySelector('#aggregation'))).toBe(
      !['boolean', 'text'].includes(type),
    );
  },
);
it('uses API units, compatible groups, default precision and canonical bounds', async () => {
  const el = await form();
  set(el, 'displayUnit', 'kilometre', 'change');
  await settle(el);
  expect(
    el.shadowRoot!.querySelector<HTMLInputElement>('#precision')!.value,
  ).toBe('2');
  expect(
    [...el.shadowRoot!.querySelectorAll('#displayUnit option')].some(
      (o) => o.getAttribute('value') === 'minute',
    ),
  ).toBe(false);
  set(el, 'name', 'Distance');
  set(el, 'minimumValue', '1.5', 'change');
  const saved = vi.fn();
  el.addEventListener('save-measurement', saved);
  submit(el);
  expect((saved.mock.calls[0]![0] as CustomEvent).detail).toMatchObject({
    canonicalUnit: 'metre',
    displayUnit: 'kilometre',
    minimumValue: 1500,
  });
  expect(
    compatibleUnits('duration', [...measurementUnits]).every(
      (u) => u.dimension === 'duration',
    ),
  ).toBe(true);
});
it('converts duration bounds without making users type raw seconds', () => {
  expect(canonicalBound('1:05:30', undefined, true)).toBe(3930);
  expect(displayBound(3930, undefined, true)).toBe('1:05:30');
  expect(canonicalBound('1:60', undefined, true)).toBeNaN();
});
it('validates reversed bounds, precision, integer values and rating aggregation', () => {
  expect(
    validateFields(
      {
        ...defaults('decimal'),
        name: 'Distance',
        precision: 7,
        minimumValue: 10,
        maximumValue: 2,
      },
      [...measurementUnits],
    ),
  ).toHaveProperty('precision');
  expect(
    validateFields(
      {
        ...defaults('decimal'),
        name: 'Distance',
        minimumValue: 10,
        maximumValue: 2,
      },
      [...measurementUnits],
    ),
  ).toHaveProperty('maximumValue');
  expect(
    validateFields(
      { ...defaults('integer'), name: 'Steps', minimumValue: 1.5 },
      [...measurementUnits],
    ),
  ).toHaveProperty('minimumValue');
  expect(
    validateFields(
      { ...defaults('rating'), name: 'Rating', aggregation: 'total' },
      [...measurementUnits],
    ),
  ).toHaveProperty('aggregation');
  expect(
    validateFields(
      {
        ...defaults('boolean'),
        name: 'Rain',
        personalBestDirection: 'highest',
      },
      [...measurementUnits],
    ),
  ).toHaveProperty('aggregation');
});
it('focuses the first invalid field and warns before losing dirty data or type settings', async () => {
  const el = await form();
  submit(el);
  await settle(el);
  expect(el.shadowRoot!.activeElement?.id).toBe('name');
  set(el, 'name', 'Distance');
  set(el, 'displayUnit', 'kilometre', 'change');
  set(el, 'valueType', 'text', 'change');
  await settle(el);
  expect(el.shadowRoot!.textContent).toContain('Changing value type clears');
  button(el.shadowRoot!, 'Keep current type').click();
  const dismissed = vi.fn();
  el.addEventListener('dismiss-measurement', dismissed);
  el.requestDismiss();
  await settle(el);
  expect(dismissed).not.toHaveBeenCalled();
  expect(el.shadowRoot!.activeElement?.id).toBe('keep-editing');
  button(el.shadowRoot!, 'Discard changes').click();
  expect(dismissed).toHaveBeenCalledOnce();
});
it('preserves edits on history conflict, explains locks and allows safe settings', async () => {
  const kind = await api.createKind(kindInput);
  const definition = await api.createMeasurement(kind.id, {
    ...defaults('decimal'),
    name: 'Distance',
    activityVariantId: null,
  });
  const el = await form();
  el.definition = definition;
  await settle(el);
  set(el, 'name', 'Travel distance');
  set(el, 'precision', '4');
  el.error = new ClientError('conflict', 'MEASUREMENT_DEFINITION_HAS_HISTORY');
  await settle(el);
  expect(el.shadowRoot!.textContent?.replace(/\s+/g, ' ')).toContain(
    'activities already use this measurement',
  );
  expect(
    el.shadowRoot!.querySelector<HTMLSelectElement>('#valueType')!.disabled,
  ).toBe(true);
  expect(el.shadowRoot!.querySelector<HTMLInputElement>('#name')!.value).toBe(
    'Travel distance',
  );
  button(el.shadowRoot!, 'Keep recorded settings').click();
  await settle(el);
  expect(
    el.shadowRoot!.querySelector<HTMLInputElement>('#precision')!.value,
  ).toBe('2');
  expect(el.shadowRoot!.querySelector<HTMLInputElement>('#name')!.value).toBe(
    'Travel distance',
  );
  el.shadowRoot!.querySelector<HTMLInputElement>('[type=checkbox]')!.click();
  const saved = vi.fn();
  el.addEventListener('save-measurement', saved);
  submit(el);
  expect((saved.mock.calls[0]![0] as CustomEvent).detail.isRequired).toBe(true);
});
it('shows parent empty, server order, archived and errors without including variant definitions', async () => {
  const el = await section();
  expect(el.shadowRoot!.textContent).toContain('No measurements yet');
  const parent = await api.createMeasurement(el.kind.id, {
    ...defaults('integer'),
    name: 'Zulu',
    sortOrder: 0,
    activityVariantId: null,
  });
  await api.createMeasurement(el.kind.id, {
    ...defaults('text'),
    name: 'Alpha',
    sortOrder: 1,
    activityVariantId: null,
  });
  await api.createMeasurement(el.kind.id, {
    ...defaults('decimal'),
    name: 'Incline',
    activityVariantId: crypto.randomUUID(),
  });
  await el.load();
  await settle(el);
  expect(
    [...el.shadowRoot!.querySelectorAll('.copy .name-button')].map(
      (e) => e.textContent,
    ),
  ).toEqual(['Zulu', 'Alpha']);
  await api.archiveMeasurement(parent.id);
  el.route += '?measurementsArchived=true';
  await settle(el);
  expect(el.shadowRoot!.textContent).toContain('Archived');
  vi.spyOn(api, 'listMeasurements').mockRejectedValue(
    new ClientError('network', 'NETWORK_ERROR'),
  );
  await el.load();
  await settle(el);
  expect(el.shadowRoot!.querySelector('[role=alert]')?.textContent).toContain(
    'server could not be reached',
  );
  expect(el.shadowRoot!.textContent).toContain('Zulu');
});
it('uses one effective request and presents inherited definitions read-only', async () => {
  const kind = await api.createKind(kindInput);
  const variant = await api.createVariant(kind.id, {
    name: 'Treadmill',
    sortOrder: 0,
    isDefault: false,
  });
  await api.createMeasurement(kind.id, {
    ...defaults('decimal'),
    name: 'Distance',
    activityVariantId: null,
  });
  await api.createMeasurement(kind.id, {
    ...defaults('decimal'),
    name: 'Incline',
    activityVariantId: variant.id,
  });
  const spy = vi.spyOn(api, 'listMeasurements');
  const el = await section(variant.id);
  expect(spy).toHaveBeenCalledOnce();
  expect(spy.mock.calls[0]?.[2]).toBe(variant.id);
  expect(el.shadowRoot!.textContent).toContain('Inherited from Walking');
  expect(el.shadowRoot!.textContent).toContain('Only for Treadmill');
  const inherited = el.shadowRoot!.querySelector(
    '[aria-label="Inherited measurements"]',
  )!;
  expect(inherited.querySelector('button')).toBeNull();
  expect(inherited.querySelector('a')?.textContent).toBe('Edit at parent');
});
it('sets and clears primary, excludes ineligible definitions and guides archive conflicts', async () => {
  const el = await section();
  const m = await api.createMeasurement(el.kind.id, {
    ...defaults('decimal'),
    name: 'Distance',
    activityVariantId: null,
  });
  await api.createMeasurement(el.kind.id, {
    ...defaults('text'),
    name: 'Route',
    activityVariantId: null,
  });
  await el.load();
  await settle(el);
  expect(
    [...el.shadowRoot!.querySelectorAll('button')].filter(
      (b) => b.textContent === 'Set as primary',
    ),
  ).toHaveLength(1);
  button(el.shadowRoot!, 'Set as primary').click();
  await settle(el);
  expect(api.kinds[0]?.primaryMeasurementDefinitionId).toBe(m.id);
  button(el.shadowRoot!, 'Archive measurement').click();
  await settle(el);
  button(
    el.shadowRoot!.querySelector('dialog')!,
    'Archive measurement',
  ).click();
  await settle(el);
  expect(el.shadowRoot!.querySelector('dialog')!.textContent).toContain(
    'Clear or replace',
  );
  button(el.shadowRoot!.querySelector('dialog')!, 'Cancel').click();
  await settle(el);
  button(el.shadowRoot!, 'Clear primary').click();
  await settle(el);
  expect(api.kinds[0]?.primaryMeasurementDefinitionId).toBeNull();
});
it('archives, restores, preserves rejected forms and prevents duplicate submissions', async () => {
  const el = await section();
  const m = await api.createMeasurement(el.kind.id, {
    ...defaults('integer'),
    name: 'Steps',
    activityVariantId: null,
  });
  await el.load();
  await settle(el);
  button(el.shadowRoot!, 'Archive measurement').click();
  await settle(el);
  button(
    el.shadowRoot!.querySelector('dialog')!,
    'Archive measurement',
  ).click();
  await settle(el);
  expect(api.measurements[0]?.isArchived).toBe(true);
  el.route += '?measurementsArchived=true';
  await settle(el);
  button(el.shadowRoot!, 'Restore measurement').click();
  await settle(el);
  button(
    el.shadowRoot!.querySelector('dialog')!,
    'Restore measurement',
  ).click();
  await settle(el);
  expect(api.measurements[0]?.isArchived).toBe(false);
  el.shadowRoot!.querySelector<HTMLButtonElement>(
    '[aria-label^="Edit measurement " ]',
  )!.click();
  await settle(el);
  const f = el.shadowRoot!.querySelector<MeasurementForm>('measurement-form')!;
  await settle(f);
  set(f, 'name', 'Renamed');
  const spy = vi
    .spyOn(api, 'updateMeasurement')
    .mockRejectedValue(
      new ClientError(
        'conflict',
        'MEASUREMENT_DEFINITION_NAME_CONFLICT',
        crypto.randomUUID(),
      ),
    );
  submit(f);
  submit(f);
  await settle(el);
  await settle(f);
  expect(spy).toHaveBeenCalledTimes(1);
  expect(el.shadowRoot!.querySelector('dialog')).not.toBeNull();
  expect(f.shadowRoot!.querySelector<HTMLInputElement>('#name')!.value).toBe(
    'Renamed',
  );
  expect(api.measurements.find((v) => v.id === m.id)?.name).toBe('Steps');
});
it('treats unavailable unit metadata as a real error and caches successful metadata', async () => {
  vi.spyOn(api, 'units').mockRejectedValue(
    new ClientError('network', 'NETWORK_ERROR'),
  );
  const el = await section();
  expect(button(el.shadowRoot!, 'Add measurement').disabled).toBe(true);
  expect(el.shadowRoot!.textContent).toContain(
    'Unit metadata could not be loaded',
  );
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(JSON.stringify({ items: measurementUnits })),
    );
  const client = createConfigurationApi({ fetch: fetcher });
  await Promise.all([client.units(), client.units()]);
  expect(fetcher).toHaveBeenCalledOnce();
});
it('aborts superseded requests and ignores stale measurement responses', async () => {
  let resolve!: (
    value: Awaited<ReturnType<MemoryConfigurationApi['listMeasurements']>>,
  ) => void;
  const spy = vi.spyOn(api, 'listMeasurements').mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const el = await section();
  expect(el.shadowRoot!.textContent).toContain('Loading measurements');
  const signal = (
    spy.mock.calls as unknown as [string, boolean, string, AbortSignal][]
  )[0]?.[3];
  el.route += '?measurementsArchived=true';
  await settle(el);
  resolve({ view: 'definitions', items: [] });
  await settle(el);
  expect(signal?.aborted).toBe(true);
  expect(el.shadowRoot!.textContent).not.toContain('Loading measurements');
});

it('warns before route changes and preserves the editor when navigation is cancelled', async () => {
  const el = await section();
  button(el.shadowRoot!, 'Add measurement').click();
  await settle(el);
  const f = el.shadowRoot!.querySelector<MeasurementForm>('measurement-form')!;
  await settle(f);
  set(f, 'name', 'Unsaved distance');
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  expect(
    window.dispatchEvent(
      new Event('before-route-change', { cancelable: true }),
    ),
  ).toBe(false);
  expect(confirm).toHaveBeenCalledOnce();
  expect(f.shadowRoot!.querySelector<HTMLInputElement>('#name')!.value).toBe(
    'Unsaved distance',
  );
  confirm.mockReturnValue(true);
  expect(
    window.dispatchEvent(
      new Event('before-route-change', { cancelable: true }),
    ),
  ).toBe(true);
});

it('keeps restore conflicts visible and does not fall back to parent creation for a missing variant', async () => {
  const el = await section();
  const m = await api.createMeasurement(el.kind.id, {
    ...defaults('decimal'),
    name: 'Distance',
    activityVariantId: null,
  });
  await api.archiveMeasurement(m.id);
  el.route += '?measurementsArchived=true';
  await settle(el);
  vi.spyOn(api, 'restoreMeasurement').mockRejectedValue(
    new ClientError('conflict', 'MEASUREMENT_DEFINITION_NAME_CONFLICT'),
  );
  button(el.shadowRoot!, 'Restore measurement').click();
  await settle(el);
  button(
    el.shadowRoot!.querySelector('dialog')!,
    'Restore measurement',
  ).click();
  await settle(el);
  expect(el.shadowRoot!.querySelector('dialog')?.textContent).toContain(
    'Distance',
  );
  expect(el.shadowRoot!.querySelector('[role=alert]')?.textContent).toContain(
    'another measurement',
  );
  expect(api.measurements[0]?.isArchived).toBe(true);
  el.variantUnavailable = true;
  await settle(el);
  expect(el.shadowRoot!.textContent).toContain('variant is unavailable');
  expect(
    [...el.shadowRoot!.querySelectorAll('button')].some((b) =>
      b.textContent?.includes('Add measurement'),
    ),
  ).toBe(false);
});

it('retries failed unit metadata instead of caching a rejected promise', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new TypeError('offline'))
    .mockResolvedValue(
      new Response(JSON.stringify({ items: measurementUnits })),
    );
  const client = createConfigurationApi({ fetch: transport });
  await expect(client.units()).rejects.toMatchObject({ kind: 'network' });
  await expect(client.units()).resolves.toHaveProperty('items');
  await client.units();
  expect(transport).toHaveBeenCalledTimes(2);
});

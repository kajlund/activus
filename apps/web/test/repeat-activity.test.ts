import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { CreateActivityRequestSchema } from '@activus/contracts';
import { editorFixture } from './support/activity-editor.js';
import {
  emptyCopy,
  initializeRepeat,
  recentChoices,
  stageRepeat,
} from '../src/features/activities/repeat.js';
import { helsinkiDate } from '../src/features/activities/values.js';
import { ActivityEditorPage } from '../src/features/activities/page.js';
import { ActivityRepeatDialog } from '../src/features/activities/repeat-dialog.js';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => {
  document.body.replaceChildren();
  history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});
async function fixture() {
  const f = await editorFixture();
  const source = await f.api.createActivity(
    CreateActivityRequestSchema.parse({
      activityKindId: f.kind.id,
      activityVariantId: f.variant.id,
      activityDate: '2024-02-29',
      startedAt: '2024-02-29T12:30:00Z',
      durationSeconds: 3661,
      name: 'Morning walk',
      notes: 'Private note content',
      effort: 4,
      feeling: 3,
      tagIds: [f.tag.id],
      isPartial: true,
      measurements: [
        {
          measurementDefinitionId: f.distance.id,
          valueType: 'decimal',
          value: '1234.56',
          unitId: 'metre',
        },
      ],
    }),
  );
  f.deps.rows.get(source.id)!.source = 'legacy';
  f.deps.rows.get(source.id)!.sourceExternalId = 'private-import-id';
  const config = {
    kinds: (await f.api.listKinds(false)).items,
    variants: (await f.api.listVariants(f.kind.id, false)).items,
    definitions: (await f.api.listMeasurements(f.kind.id, false, f.variant.id))
      .items,
  };
  return { ...f, source, config };
}
it('repeats classification only and resets historical facts using the Helsinki calendar', async () => {
  const f = await fixture();
  const today = helsinkiDate(new Date('2026-09-30T21:30:00Z'));
  expect(today).toBe('2026-10-01');
  const result = initializeRepeat(f.source, f.config, emptyCopy, today);
  expect(result.draft).toEqual({
    activityKindId: f.kind.id,
    activityVariantId: f.variant.id,
    name: 'Morning walk',
    activityDate: today,
    start: '',
    hours: '',
    minutes: '',
    seconds: '',
    notes: '',
    effort: '',
    feeling: '',
    tagIds: [],
  });
  expect(result.values).toEqual({});
  expect(result.copied).toEqual({});
  expect(result.warnings).toEqual([]);
  expect(JSON.stringify(result)).not.toContain(f.source.id);
  expect(JSON.stringify(result)).not.toContain('private-import-id');
});
it('copies values and notes only explicitly, preserving exact canonical numbers under current units', async () => {
  const f = await fixture();
  const result = initializeRepeat(
    f.source,
    f.config,
    { copyValues: true, copyNotes: false },
    '2026-10-01',
  );
  expect(result.draft).toMatchObject({
    hours: '1',
    minutes: '1',
    seconds: '1',
    notes: '',
    start: '',
    effort: '',
    feeling: '',
  });
  expect(result.values[f.distance.id]).toBe('1.23');
  expect(result.copied[f.distance.id]?.input.value).toBe('1234.56');
  const changedUnit = {
    ...f.config,
    definitions: f.config.definitions.map((d) => ({
      ...d,
      displayUnit: 'metre' as const,
    })),
  };
  expect(
    initializeRepeat(
      f.source,
      changedUnit,
      { copyValues: true, copyNotes: true },
      '2026-10-01',
    ).values[f.distance.id],
  ).toBe('1234.56');
  const notesOnly = initializeRepeat(
    f.source,
    f.config,
    { copyValues: false, copyNotes: true },
    '2026-10-01',
  );
  expect(notesOnly.draft.notes).toBe(f.source.notes);
  expect(notesOnly.values).toEqual({});
  expect(notesOnly.draft.hours).toBe('');
});
it('warns for archived references and changed definitions without selecting substitutes or keeping invalid values', async () => {
  const f = await fixture();
  const result = initializeRepeat(
    f.source,
    {
      ...f.config,
      variants: f.config.variants.map((v) => ({
        ...v,
        isArchived: v.id === f.variant.id,
      })),
      definitions: f.config.definitions.map((d) => ({
        ...d,
        maximumValue: 100,
      })),
    },
    { copyValues: true, copyNotes: false },
    '2026-10-01',
  );
  expect(result.draft.activityKindId).toBe(f.kind.id);
  expect(result.draft.activityVariantId).toBe('');
  expect(result.warnings.map((w) => w.code)).toEqual([
    'variant',
    'measurement',
  ]);
  expect(result.values).toEqual({});
  const archived = initializeRepeat(
    f.source,
    {
      ...f.config,
      kinds: f.config.kinds.map((k) => ({ ...k, isArchived: true })),
    },
    emptyCopy,
    '2026-10-01',
  );
  expect(archived.draft.activityKindId).toBe('');
  expect(archived.warnings[0]?.code).toBe('kind');
});
it('uses explicit dialog choices and normal create to save an independent activity without changing the source', async () => {
  const f = await fixture();
  const original = structuredClone(f.deps.rows.get(f.source.id));
  const dialog = new ActivityRepeatDialog();
  dialog.hasNotes = true;
  document.body.append(dialog);
  await dialog.updateComplete;
  expect(dialog.shadowRoot!.textContent).not.toContain(f.source.notes);
  expect(
    dialog.shadowRoot!.querySelector<HTMLInputElement>('input[value="empty"]')!
      .checked,
  ).toBe(true);
  dialog
    .shadowRoot!.querySelector<HTMLInputElement>('input[value="copy"]')!
    .click();
  dialog
    .shadowRoot!.querySelector<HTMLInputElement>('input[name="notes"]')!
    .click();
  dialog.addEventListener('repeat-confirm', (event: Event) =>
    stageRepeat(f.source.id, (event as CustomEvent).detail),
  );
  dialog
    .shadowRoot!.querySelector('form')!
    .dispatchEvent(new Event('submit', { cancelable: true }));
  const create = vi.spyOn(f.api, 'createActivity'),
    update = vi.spyOn(f.api, 'updateActivity');
  history.replaceState(null, '', `/activities/new?repeat=${f.source.id}`);
  const page = new ActivityEditorPage();
  page.api = f.api;
  document.body.append(page);
  await vi.waitFor(() =>
    expect(page.shadowRoot!.textContent).toContain('Based on activity from'),
  );
  page
    .shadowRoot!.querySelector('form')!
    .dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  await vi.waitFor(() => expect(f.deps.rows.size).toBe(2));
  expect(update).not.toHaveBeenCalled();
  const created = [...f.deps.rows.values()].find((a) => a.id !== f.source.id)!;
  expect(created).toMatchObject({
    activityKindId: f.kind.id,
    activityVariantId: f.variant.id,
    durationSeconds: 3661,
    notes: f.source.notes,
    startedAt: null,
    effort: null,
    feeling: null,
    source: null,
    sourceExternalId: null,
    isPartial: false,
  });
  expect(f.deps.rows.get(f.source.id)).toEqual(original);
  expect(
    (await f.api.getActivity(created.id)).measurements[0]?.canonicalValue,
  ).toBe('1234.56');
  expect(create.mock.calls[0]![0]).not.toHaveProperty('id');
  expect(create.mock.calls[0]![0]).not.toHaveProperty('createdAt');
  expect(location.search).not.toContain('Private');
});
it('deduplicates at most five recent active setups by kind, variant and normalized name', async () => {
  const f = await fixture();
  const a = (await f.api.listActivities({ limit: 30, offset: 0 })).items[0]!;
  const items = [
    a,
    { ...a, id: 'duplicate', name: ' MORNING   WALK ' },
    {
      ...a,
      id: 'other-variant',
      variant: { id: f.otherVariant.id, name: 'Treadmill', isArchived: false },
    },
    { ...a, id: 'archived', kind: { ...a.kind, isArchived: true } },
    ...Array.from({ length: 6 }, (_, i) => ({
      ...a,
      id: `distinct-${i}`,
      name: `Walk ${i}`,
    })),
  ];
  expect(recentChoices(items).map((c) => c.id)).toEqual([
    a.id,
    'other-variant',
    'distinct-0',
    'distinct-1',
    'distinct-2',
  ]);
  history.replaceState(null, '', '/activities/new');
  const page = new ActivityEditorPage();
  page.api = f.api;
  document.body.append(page);
  await vi.waitFor(() =>
    expect(
      page.shadowRoot!.querySelector('.quick-choices button'),
    ).not.toBeNull(),
  );
  page
    .shadowRoot!.querySelector<HTMLButtonElement>('.quick-choices button')!
    .click();
  await vi.waitFor(() =>
    expect(page.shadowRoot!.textContent).toContain('Based on activity from'),
  );
  const field = (id: string) =>
    page.shadowRoot!.querySelector<HTMLInputElement>(`#${id}`)!.value;
  expect(field('name')).toBe(f.source.name);
  expect(field('hours')).toBe('');
  expect(field('notes')).toBe('');
  expect(field(`m-${f.distance.id}`)).toBe('');
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  page
    .shadowRoot!.querySelector<HTMLButtonElement>('.quick-heading button')!
    .click();
  await page.updateComplete;
  expect(field('name')).toBe('');
  expect(location.search).not.toContain('repeat');
});

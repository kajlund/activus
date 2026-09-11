import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import type { LitElement } from 'lit';
import { ActivityJournalPage } from '../src/features/journal/page.js';
import { ActivityDetailPage } from '../src/features/journal/detail.js';
import { JournalFilters } from '../src/features/journal/filters.js';
import { ActivityDeleteDialog } from '../src/features/journal/delete-dialog.js';
import { ClientError } from '../src/services/configuration-api.js';
import { journalFixture } from './support/journal.js';
import {
  journalPath,
  parseJournal,
  safeReturn,
  withReturn,
} from '../src/features/journal/state.js';
import {
  duration,
  exactNumber,
  journalDate,
  measurementText,
} from '../src/features/journal/format.js';

let f: Awaited<ReturnType<typeof journalFixture>>;
beforeEach(async () => {
  f = await journalFixture();
  history.replaceState(null, '', '/activities');
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
async function settle(el: LitElement) {
  for (let i = 0; i < 150; i++) await Promise.resolve();
  await el.updateComplete;
}
async function page(route = '/activities') {
  const el = new ActivityJournalPage();
  el.route = route;
  el.api = f.api;
  document.body.append(el);
  await settle(el);
  return el;
}
async function detail(id = f.activities[0]!.id, back = '/activities') {
  const el = new ActivityDetailPage();
  el.route = withReturn(`/activities/${id}`, back);
  el.api = f.api;
  document.body.append(el);
  await settle(el);
  return el;
}
const text = (el: LitElement) => el.shadowRoot!.textContent ?? '';
it('links matching goals to the activity period and reloads after browser document restoration', async () => {
  const activityGoals = vi.fn().mockResolvedValue({
    items: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Weekly walks',
        lifecycle: 'ended',
        scheduleMode: 'recurring',
        recurrencePeriod: 'week',
        startDate: '2026-01-01',
        endDate: '2026-09-07',
        period: { startDate: '2026-09-07', endDate: '2026-09-07' },
      },
    ],
    pagination: { limit: 25, offset: 0, hasMore: false, nextOffset: null },
  });
  const el = new ActivityDetailPage();
  el.route = `/activities/${f.activities[0]!.id}`;
  el.api = { ...f.api, activityGoals };
  document.body.append(el);
  await settle(el);
  const link =
    el.shadowRoot!.querySelector<HTMLAnchorElement>('.matching-goal')!;
  expect(link.textContent).toBe('Weekly walks');
  expect(link.getAttribute('href')).toBe(
    '/goals/11111111-1111-4111-8111-111111111111?view=ended&period=2026-09-07',
  );
  window.dispatchEvent(
    new PageTransitionEvent('pageshow', { persisted: true }),
  );
  await settle(el);
  expect(activityGoals).toHaveBeenCalledTimes(2);
});
it('keeps activity detail available when matching goals fail and offers an independent retry', async () => {
  const activityGoals = vi
    .fn()
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValue({
      items: [],
      pagination: { limit: 25, offset: 0, hasMore: false, nextOffset: null },
    });
  const el = new ActivityDetailPage();
  el.route = `/activities/${f.activities[0]!.id}`;
  el.api = { ...f.api, activityGoals };
  document.body.append(el);
  await settle(el);
  expect(text(el)).toContain('Entry 01');
  expect(text(el)).toContain('Matching goals unavailable');
  expect(el.shadowRoot!.querySelector('a.primary')?.textContent).toContain(
    'Edit activity',
  );
  button(el, 'Retry goals').click();
  await settle(el);
  expect(activityGoals).toHaveBeenCalledTimes(2);
  expect(text(el)).not.toContain('Matching goals unavailable');
});
function button(el: LitElement, label: string) {
  return [...el.shadowRoot!.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label,
  )!;
}
function field(
  el: LitElement,
  selector: string,
  value: string,
  event = 'input',
) {
  const input = el.shadowRoot!.querySelector<HTMLInputElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event(event, { bubbles: true }));
}
it('groups ordered summaries and displays real zero values without detail N+1 reads', async () => {
  const list = vi.spyOn(f.api, 'listActivities');
  const get = vi.spyOn(f.api, 'getActivity');
  const el = await page();
  expect(el.shadowRoot!.querySelectorAll('.row')).toHaveLength(25);
  expect(
    el.shadowRoot!.querySelector('.group time')?.getAttribute('datetime'),
  ).toBe('2026-09-07');
  expect(text(el)).toContain('0 s');
  expect(text(el)).toContain('0\u00a0km');
  expect(text(el)).toContain('Notes recorded');
  expect(get).not.toHaveBeenCalled();
  expect(list).toHaveBeenCalledTimes(1);
});
it('keeps an empty journal distinct from filtered no-results', async () => {
  f.deps.rows.clear();
  const empty = await page();
  expect(text(empty)).toContain('No activities recorded yet');
  expect(empty.shadowRoot!.querySelector('.empty a')?.textContent).toContain(
    'Record your first activity',
  );
  const filtered = await page('/activities?dateFrom=2020-01-01');
  expect(text(filtered)).toContain('No activities match these filters');
});
it('retries initial load failures while retaining usable filters and request IDs', async () => {
  vi.spyOn(f.api, 'listActivities').mockRejectedValueOnce(
    new ClientError(
      'network',
      'NETWORK_ERROR',
      '12345678-1234-4234-8234-123456789012',
    ),
  );
  const el = await page();
  expect(text(el)).toContain('12345678-1234-4234-8234-123456789012');
  expect(button(el, 'Filters')).toBeDefined();
  button(el, 'Retry activities').click();
  await settle(el);
  expect(el.shadowRoot!.querySelectorAll('.row')).toHaveLength(25);
});
it('retains loaded rows during a failed filter refresh without representing them as new matches', async () => {
  const el = await page();
  vi.spyOn(f.api, 'listActivities').mockRejectedValueOnce(
    new ClientError('network', 'NETWORK_ERROR'),
  );
  el.route = '/activities?dateFrom=2030-01-01';
  await settle(el);
  expect(el.shadowRoot!.querySelectorAll('.row')).toHaveLength(25);
  expect(text(el)).toContain('may not match the current filters');
});
it('loads another page once, keeps rows on failure, retries and ends cleanly', async () => {
  const el = await page();
  const list = vi
    .spyOn(f.api, 'listActivities')
    .mockRejectedValueOnce(new ClientError('network', 'NETWORK_ERROR'));
  await el.load(true);
  await settle(el);
  expect(el.shadowRoot!.querySelectorAll('.row')).toHaveLength(25);
  expect(button(el, 'Retry loading more')).toBeDefined();
  await el.load(true);
  await settle(el);
  expect(el.shadowRoot!.querySelectorAll('.row')).toHaveLength(30);
  expect(
    button(el, 'All activities loaded').getAttribute('aria-disabled'),
  ).toBe('true');
  expect(el.shadowRoot!.activeElement).toBe(
    button(el, 'All activities loaded'),
  );
  expect(list).toHaveBeenCalledTimes(2);
  await el.load(true);
  expect(list).toHaveBeenCalledTimes(2);
});
it('deduplicates IDs across offset pages and prevents duplicate load-more requests', async () => {
  const el = await page();
  const result = await f.api.listActivities({ limit: 25, offset: 0 });
  let release!: (value: typeof result) => void;
  const list = vi.spyOn(f.api, 'listActivities').mockImplementationOnce(
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  const pending = el.load(true);
  await el.load(true);
  expect(list).toHaveBeenCalledOnce();
  release({
    ...result,
    pagination: { limit: 25, offset: 25, hasMore: false, nextOffset: null },
  });
  await pending;
  await settle(el);
  expect(el.shadowRoot!.querySelectorAll('.row')).toHaveLength(25);
});
it('ignores stale responses and resets pagination when filters change', async () => {
  const el = await page();
  const original = f.api.listActivities.bind(f.api);
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  vi.spyOn(f.api, 'listActivities').mockImplementation(
    async (query, signal) => {
      if (query.dateFrom === '2020-01-01') await gate;
      return original(query, signal);
    },
  );
  el.route = '/activities?dateFrom=2020-01-01';
  await settle(el);
  el.route = '/activities?dateFrom=2030-01-01';
  await settle(el);
  release();
  await settle(el);
  expect(el.shadowRoot!.querySelectorAll('.row')).toHaveLength(0);
  expect(text(el)).toContain('No activities match');
});
it('combines a full-year kind, variant and all-tags query through the real API', async () => {
  const route = journalPath({
    dateFrom: '2026-01-01',
    dateTo: '2026-12-31',
    activityKindId: f.kind.id,
    activityVariantId: f.otherVariant.id,
    tagIds: [f.tag.id, f.otherTag.id],
    tagMatch: 'all',
  });
  const el = await page(route);
  expect(el.shadowRoot!.querySelectorAll('.row')).toHaveLength(15);
  expect(text(el)).toContain('Matching all selected tags');
  expect(text(el)).toContain('Treadmill');
});
it('distinguishes any-tag matching from all-tag matching', async () => {
  const any = await f.api.listActivities({
    limit: 100,
    offset: 0,
    tagIds: [f.tag.id, f.otherTag.id],
    tagMatch: 'any',
  });
  const all = await f.api.listActivities({
    limit: 100,
    offset: 0,
    tagIds: [f.tag.id, f.otherTag.id],
    tagMatch: 'all',
  });
  expect(any.items).toHaveLength(30);
  expect(all.items).toHaveLength(15);
});
it('removes a kind chip with its dependent variant while preserving dates and tags', async () => {
  const el = await page(
    journalPath({
      activityKindId: f.kind.id,
      activityVariantId: f.otherVariant.id,
      dateFrom: '2026-01-01',
      tagIds: [f.tag.id],
      tagMatch: 'any',
    }),
  );
  el.shadowRoot!.querySelector<HTMLButtonElement>(
    '[aria-label="Remove filter: Walking"]',
  )!.click();
  expect(location.search).toContain('dateFrom');
  expect(location.search).toContain('tagIds');
  expect(location.search).not.toContain('activityKindId');
  expect(location.search).not.toContain('activityVariantId');
});
it('normalizes invalid, repeated and unsupported URL parameters without sending search or offsets', () => {
  expect(
    parseJournal(
      '?dateFrom=bad&dateTo=2026-01-01&search=private&offset=100&activityKindId=no',
    ).filters,
  ).toEqual({ dateTo: '2026-01-01' });
  expect(
    parseJournal('?dateFrom=2027-01-01&dateTo=2026-01-01').filters,
  ).toEqual({});
  expect(parseJournal(`?activityVariantId=${f.variant.id}`).filters).toEqual(
    {},
  );
  expect(
    parseJournal('?dateFrom=2026-01-01&dateFrom=2026-02-01').filters,
  ).toEqual({});
});
it('rejects external and malformed return URLs while preserving filtered internal routes', () => {
  for (const value of [
    'https://evil.example',
    '//evil.example',
    '/activities/../../outside',
    'javascript:alert(1)',
    '/activities/new',
    '/activities/not-an-id',
  ])
    expect(safeReturn(value)).toBe('/activities');
  const route = journalPath({
    activityKindId: f.kind.id,
    dateFrom: '2026-01-01',
  });
  expect(safeReturn(route)).toBe(route);
  expect(
    safeReturn(withReturn(`/activities/${f.activities[0]!.id}`, route)),
  ).toContain('returnTo=');
});
it('formats precise dates, zero durations, locale decimals and large numbers without rounding', () => {
  expect(journalDate('2026-01-01', 'en-GB')).toBe('1 January 2026');
  expect(duration(0, 'en')).toBe('0 s');
  expect(duration(5101, 'en')).toBe('1 h 25 min 1 s');
  expect(exactNumber('9007199254740990.123456', 'en-US')).toBe(
    '9,007,199,254,740,990.123456',
  );
  expect(exactNumber('-0.25', 'fi')).toContain('0,25');
  expect(
    measurementText({
      ...f.activities[0]!.measurements[0]!,
      valueType: 'boolean',
      canonicalValue: false,
      displayValue: false,
    }).text,
  ).toBe('No');
});
it('renders all detail values, multiline plain notes, historical references and safe edit context', async () => {
  const a = f.activities[0]!;
  f.deps.activityKinds.rows.get(f.kind.id)!.archivedAt = new Date();
  f.deps.variants.rows.get(f.variant.id)!.archivedAt = new Date();
  f.deps.tags.rows.get(f.tag.id)!.archivedAt = new Date();
  f.deps.measurements.rows.get(f.distance.id)!.archivedAt = new Date();
  const el = await detail(a.id, journalPath({ dateFrom: '2026-01-01' }));
  expect(text(el)).toContain('archived');
  expect(text(el)).toContain('Along the river\nA plain-text journal note.');
  expect(text(el)).toContain('0 s');
  expect(el.shadowRoot!.querySelector('.back')?.getAttribute('href')).toContain(
    'dateFrom',
  );
  expect(
    el.shadowRoot!.querySelector('header a')?.getAttribute('href'),
  ).toContain('/edit?returnTo=');
});
it('distinguishes detail not-found and generic failure with safe retry and back navigation', async () => {
  const el = await detail(crypto.randomUUID());
  expect(text(el)).toContain('Activity not found');
  expect(el.shadowRoot!.querySelector('.back')).not.toBeNull();
  vi.spyOn(f.api, 'getActivity').mockRejectedValueOnce(
    new ClientError('network', 'NETWORK_ERROR'),
  );
  await el.load();
  await settle(el);
  expect(text(el)).toContain('Activity unavailable');
});
it('filters apply once, validate range locally, and permit all-tags selection before selecting tags', async () => {
  const el = new JournalFilters();
  el.api = f.api;
  el.kinds = (await f.api.listKinds(true)).items;
  el.tags = (await f.api.listTags(true)).items;
  el.filters = {};
  document.body.append(el);
  await settle(el);
  const apply = vi.fn();
  el.addEventListener('apply-filters', apply);
  field(el, '#dateFrom', '2026-12-31');
  field(el, '#dateTo', '2026-01-01');
  el.shadowRoot!.querySelector('form')!.dispatchEvent(
    new Event('submit', { cancelable: true }),
  );
  await settle(el);
  expect(apply).not.toHaveBeenCalled();
  expect(text(el)).toContain('end on or after');
  field(el, '#dateFrom', '2026-01-01');
  const selects = el.shadowRoot!.querySelectorAll('select');
  selects[1]!.value = 'all';
  selects[1]!.dispatchEvent(new Event('change'));
  el.shadowRoot!.querySelector<HTMLInputElement>(
    'input[type=checkbox]',
  )!.click();
  await settle(el);
  el.shadowRoot!.querySelector('form')!.dispatchEvent(
    new Event('submit', { cancelable: true }),
  );
  expect((apply.mock.calls[0]![0] as CustomEvent).detail.tagMatch).toBe('all');
});
it('delete confirmation keeps data on failure, prevents double deletion and uses the real 204 endpoint', async () => {
  const el = new ActivityDeleteDialog();
  el.api = f.api;
  el.activity = f.activities[0];
  document.body.append(el);
  await settle(el);
  expect(text(el)).toContain('permanently deletes');
  expect(text(el)).toContain('Walking');
  const remove = vi
    .spyOn(f.api, 'deleteActivity')
    .mockRejectedValueOnce(new ClientError('network', 'NETWORK_ERROR'));
  button(el, 'Delete activity').click();
  await settle(el);
  expect(f.deps.rows.has(f.activities[0]!.id)).toBe(true);
  expect(text(el)).toContain('server could not be reached');
  button(el, 'Delete activity').click();
  button(el, 'Delete activity').click();
  await settle(el);
  expect(remove).toHaveBeenCalledTimes(2);
  expect(f.deps.rows.has(f.activities[0]!.id)).toBe(false);
});
it('reloads summaries after deletion and returns focus to the journal heading', async () => {
  const el = await page();
  button(el, 'Delete activity').click();
  await settle(el);
  const dialog = el.shadowRoot!.querySelector<ActivityDeleteDialog>(
    'activity-delete-dialog',
  )!;
  await settle(dialog);
  button(dialog, 'Delete activity').click();
  await settle(dialog);
  await settle(el);
  expect(f.deps.rows.size).toBe(29);
  expect(el.shadowRoot!.querySelectorAll('.row')).toHaveLength(25);
  expect(el.shadowRoot!.activeElement).toBe(el.shadowRoot!.querySelector('h1'));
});
it('retains archived references as filter options and does not hide their activities', async () => {
  f.deps.activityKinds.rows.get(f.kind.id)!.archivedAt = new Date();
  f.deps.tags.rows.get(f.tag.id)!.archivedAt = new Date();
  const el = await page(
    journalPath({
      activityKindId: f.kind.id,
      tagIds: [f.tag.id],
      tagMatch: 'all',
    }),
  );
  expect(el.shadowRoot!.querySelectorAll('.row')).toHaveLength(25);
  expect(text(el)).toContain('Walking (archived)');
});

it('allows the completion navigation after successful deletion while blocking navigation during the request', async () => {
  const el = new ActivityDeleteDialog();
  el.api = f.api;
  el.activity = f.activities[0];
  document.body.append(el);
  await settle(el);
  let complete!: () => void;
  vi.spyOn(f.api, 'deleteActivity').mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
  );
  let navigationAllowed = false;
  el.addEventListener('activity-deleted', () => {
    navigationAllowed = window.dispatchEvent(
      new Event('before-route-change', { cancelable: true }),
    );
  });
  button(el, 'Delete activity').click();
  await settle(el);
  expect(
    window.dispatchEvent(
      new Event('before-route-change', { cancelable: true }),
    ),
  ).toBe(false);
  complete();
  await settle(el);
  expect(navigationAllowed).toBe(true);
});
it('omits missing optional facts instead of inventing zeroes for a minimal activity', async () => {
  const kind = await f.api.createKind({
    name: 'Stretching',
    iconName: 'activity',
    color: '#67318F',
    sortOrder: 1,
  });
  const response = await f.app.request('/api/v1/activities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      activityKindId: kind.id,
      activityDate: '2026-09-07',
      measurements: [],
    }),
  });
  expect(response.status).toBe(201);
  const el = await page(journalPath({ activityKindId: kind.id }));
  expect(el.shadowRoot!.querySelectorAll('.row')).toHaveLength(1);
  expect(text(el)).toContain('Stretching');
  expect(el.shadowRoot!.querySelectorAll('.measure')).toHaveLength(0);
  expect(el.shadowRoot!.querySelector('.facts')!.textContent!.trim()).toBe('');
});
it('preserves the server tie-breaker for equal activity dates, start times and creation times', async () => {
  for (const a of f.deps.rows.values()) {
    a.activityDate = '2026-09-07';
    a.startedAt = null;
  }
  const expected = [...f.deps.rows.values()]
    .sort((a, b) => b.id.localeCompare(a.id))
    .slice(0, 25)
    .map((a) => a.name);
  const el = await page();
  expect(
    [...el.shadowRoot!.querySelectorAll('.title')].map((a) => a.textContent),
  ).toEqual(expected);
});
it('does not append a later page to stale rows after a failed filter refresh', async () => {
  const el = await page();
  const calls = vi
    .spyOn(f.api, 'listActivities')
    .mockRejectedValueOnce(new ClientError('network', 'NETWORK_ERROR'));
  el.route = '/activities?dateFrom=2030-01-01';
  await settle(el);
  await el.load(true);
  expect(calls).toHaveBeenCalledTimes(1);
});

it('discards unapplied filter changes when the filter dialog is reopened', async () => {
  const el = await page();
  button(el, 'Filters').click();
  await settle(el);
  const filters =
    el.shadowRoot!.querySelector<JournalFilters>('journal-filters')!;
  await settle(filters);
  field(filters, '#dateFrom', '2026-01-01');
  button(filters, 'Cancel').click();
  await settle(el);
  button(el, 'Filters').click();
  await settle(el);
  await settle(filters);
  expect(
    filters.shadowRoot!.querySelector<HTMLInputElement>('#dateFrom')!.value,
  ).toBe('');
});
it('keeps this-week dates in the correct months across a month boundary', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    vi.setSystemTime(new Date(2026, 9, 1, 12));
    const el = new JournalFilters();
    el.api = f.api;
    document.body.append(el);
    await settle(el);
    button(el, 'This week').click();
    await settle(el);
    expect(
      el.shadowRoot!.querySelector<HTMLInputElement>('#dateFrom')!.value,
    ).toBe('2026-09-28');
    expect(
      el.shadowRoot!.querySelector<HTMLInputElement>('#dateTo')!.value,
    ).toBe('2026-10-04');
  } finally {
    vi.useRealTimers();
  }
});

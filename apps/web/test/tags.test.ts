import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LitElement } from 'lit';
import { TagsPage } from '../src/features/tags/page.js';
import { TagForm, tagNameLimit } from '../src/features/tags/form.js';
import { MemoryTagApi } from './support/tag-api.js';
import {
  ClientError,
  createConfigurationApi,
} from '../src/services/configuration-api.js';

let api: MemoryTagApi;
const listeners: (() => void)[] = [];
beforeEach(() => {
  api = new MemoryTagApi();
  history.replaceState(null, '', '/tags');
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => {
  document.body.replaceChildren();
  for (const listener of listeners)
    window.removeEventListener('popstate', listener);
  listeners.length = 0;
  history.replaceState(null, '', '/');
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function settle(el: LitElement) {
  for (let i = 0; i < 12; i++) await Promise.resolve();
  await el.updateComplete;
}
async function page(route = '/tags') {
  history.replaceState(null, '', route);
  const el = new TagsPage();
  el.route = route;
  el.api = api;
  const listener = () => {
    el.route = location.pathname + location.search;
  };
  listeners.push(listener);
  window.addEventListener('popstate', listener);
  document.body.append(el);
  await settle(el);
  return el;
}
function button(root: ShadowRoot | Element, name: string) {
  const el = [...root.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === name,
  );
  if (!el) throw new Error(`Missing ${name}`);
  return el;
}
function input(el: LitElement, id: string, value: string) {
  const field = el.shadowRoot!.querySelector<HTMLInputElement>(`#${id}`)!;
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}
async function editor(el: TagsPage, action = 'New tag') {
  button(el.shadowRoot!, action).click();
  await settle(el);
  const f = el.shadowRoot!.querySelector<TagForm>('tag-form')!;
  await settle(f);
  return f;
}
const submit = (f: TagForm) =>
  f
    .shadowRoot!.querySelector('form')!
    .dispatchEvent(new Event('submit', { cancelable: true }));
const names = (el: TagsPage) =>
  [...el.shadowRoot!.querySelectorAll('.name strong')].map(
    (n) => n.textContent,
  );

it('renders first-use and all-archived empty states without invented tags', async () => {
  const el = await page();
  expect(el.shadowRoot!.textContent).toContain('No tags yet');
  expect(button(el.shadowRoot!, 'Create your first tag')).toBeDefined();
  const tag = await api.createTag({ name: 'Recovery', color: null });
  await api.archiveTag(tag.id);
  await el.load();
  await settle(el);
  expect(el.shadowRoot!.textContent).toContain('No active tags');
  button(el.shadowRoot!, 'Include archived tags').click();
  await settle(el);
  expect(names(el)).toEqual(['Recovery']);
});
it('renders server ordering and an explicit no-archived notice', async () => {
  await api.createTag({ name: 'Zulu', color: null });
  await api.createTag({ name: 'commute', color: '#527FA5' });
  const el = await page('/tags?archived=true');
  expect(names(el)).toEqual(['commute', 'Zulu']);
  expect(el.shadowRoot!.textContent).toContain('No archived tags.');
  expect(
    el.shadowRoot!.querySelector('[role=img]')?.getAttribute('aria-label'),
  ).toBe('Colour #527FA5');
});
it('retains the shell for loading and actionable errors with request IDs', async () => {
  let reject!: (e: unknown) => void;
  vi.spyOn(api, 'listTags').mockImplementationOnce(
    () =>
      new Promise((_r, j) => {
        reject = j;
      }),
  );
  const el = await page();
  expect(el.shadowRoot!.textContent).toContain('Loading tags');
  expect(button(el.shadowRoot!, 'New tag').disabled).toBe(false);
  const requestId = crypto.randomUUID();
  reject(new ClientError('network', 'NETWORK_ERROR', requestId));
  await settle(el);
  expect(el.shadowRoot!.querySelector('[role=alert]')?.textContent).toContain(
    requestId,
  );
  button(el.shadowRoot!, 'Retry tags').click();
  await settle(el);
  expect(el.shadowRoot!.textContent).toContain('No tags yet');
});
it('debounces search, combines archived state and clears a no-results query in the URL', async () => {
  vi.useFakeTimers();
  const t = await api.createTag({ name: 'Commute', color: null });
  await api.archiveTag(t.id);
  const spy = vi.spyOn(api, 'listTags');
  const el = await page('/tags?archived=true');
  spy.mockClear();
  input(el, 'search', 'com');
  await vi.advanceTimersByTimeAsync(150);
  input(el, 'search', 'COMMUTE');
  await vi.advanceTimersByTimeAsync(299);
  expect(spy).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await settle(el);
  expect(spy).toHaveBeenCalledWith(true, 'COMMUTE', expect.any(AbortSignal));
  expect(location.search).toContain('search=COMMUTE');
  expect(names(el)).toEqual(['Commute']);
  input(el, 'search', 'none');
  await vi.advanceTimersByTimeAsync(300);
  await settle(el);
  expect(el.shadowRoot!.textContent).toContain('No matching tags');
  button(el.shadowRoot!, 'Clear search').click();
  await settle(el);
  expect(location.search).toBe('?archived=true');
  expect(names(el)).toEqual(['Commute']);
});
it('keeps the last list while querying and rejects stale out-of-order responses', async () => {
  vi.useFakeTimers();
  const tag = await api.createTag({ name: 'Recovery', color: null });
  const el = await page();
  let resolve!: (result: { items: typeof api.tags }) => void;
  const spy = vi.spyOn(api, 'listTags').mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  input(el, 'search', 'rec');
  await vi.advanceTimersByTimeAsync(300);
  await settle(el);
  expect(names(el)).toEqual(['Recovery']);
  const signal = spy.mock.calls[0]?.[2];
  input(el, 'search', 'nothing');
  expect(signal?.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(300);
  await settle(el);
  resolve({ items: [tag] });
  await settle(el);
  expect(names(el)).toEqual([]);
  expect(el.shadowRoot!.textContent).toContain('No matching tags');
});
it('creates a trimmed tag with a named colour choice and announces success', async () => {
  const el = await page();
  const f = await editor(el);
  expect(f.shadowRoot!.activeElement?.id).toBe('name');
  input(f, 'name', '  Commute  ');
  f.shadowRoot!.querySelector<HTMLInputElement>(
    '[aria-label="Blue #527FA5"]',
  )!.click();
  submit(f);
  await settle(el);
  expect(api.tags[0]).toMatchObject({ name: 'Commute', color: '#527FA5' });
  expect(el.shadowRoot!.querySelector('dialog')).toBeNull();
  expect(el.shadowRoot!.querySelector('[role=status]')?.textContent).toContain(
    'created',
  );
  expect(el.shadowRoot!.activeElement?.textContent?.trim()).toBe('New tag');
});
it.each(['', ' '.repeat(4), 'x'.repeat(tagNameLimit + 1)])(
  'validates required and maximum-length names: %j',
  async (value) => {
    const el = await page();
    const f = await editor(el);
    input(f, 'name', value);
    submit(f);
    await settle(f);
    expect(f.shadowRoot!.activeElement?.id).toBe('name');
    expect(f.shadowRoot!.querySelector('#name-error')?.textContent).toContain(
      `1–${tagNameLimit}`,
    );
    expect(api.tags).toHaveLength(0);
  },
);
it('preserves duplicate-name input including archived-name conflicts', async () => {
  const tag = await api.createTag({ name: 'Recovery', color: null });
  await api.archiveTag(tag.id);
  const el = await page();
  const f = await editor(el);
  input(f, 'name', 'recovery');
  submit(f);
  await settle(el);
  await settle(f);
  expect(f.shadowRoot!.querySelector<HTMLInputElement>('#name')!.value).toBe(
    'recovery',
  );
  expect(f.shadowRoot!.querySelector('#name-error')?.textContent).toContain(
    'including archived',
  );
  expect(f.shadowRoot!.activeElement?.id).toBe('name');
});
it('edits only changed fields, preserves an existing custom colour and explicitly clears colour', async () => {
  const tag = await api.createTag({ name: 'Race', color: '#123456' });
  const spy = vi.spyOn(api, 'updateTag');
  const el = await page();
  let f = await editor(el, 'Edit tag');
  expect(
    f.shadowRoot!.querySelector<HTMLInputElement>(
      '[aria-label="Existing colour #123456"]',
    )!.checked,
  ).toBe(true);
  input(f, 'name', 'Race day');
  submit(f);
  await settle(el);
  expect(spy).toHaveBeenLastCalledWith(
    tag.id,
    { name: 'Race day' },
    expect.any(AbortSignal),
  );
  f = await editor(el, 'Edit tag');
  f.shadowRoot!.querySelector<HTMLInputElement>(
    '[aria-label="No colour"]',
  )!.click();
  submit(f);
  await settle(el);
  expect(spy).toHaveBeenLastCalledWith(
    tag.id,
    { color: null },
    expect.any(AbortSignal),
  );
  expect(api.tags[0]?.color).toBeNull();
});
it('requires archival confirmation, recovers focus when the row disappears, and restores', async () => {
  const tag = await api.createTag({ name: 'Holiday', color: null });
  const el = await page();
  button(el.shadowRoot!, 'Archive tag').click();
  await settle(el);
  const dialog = el.shadowRoot!.querySelector('dialog')!;
  expect(dialog.textContent).toContain('Historical activities keep this tag');
  expect(api.tags[0]?.isArchived).toBe(false);
  button(dialog, 'Archive tag').click();
  await settle(el);
  expect(api.tags[0]?.isArchived).toBe(true);
  expect(el.shadowRoot!.activeElement?.tagName).toBe('H1');
  el.route = '/tags?archived=true';
  await settle(el);
  button(el.shadowRoot!, 'Restore tag').click();
  await settle(el);
  button(el.shadowRoot!.querySelector('dialog')!, 'Restore tag').click();
  await settle(el);
  expect((await api.getTag(tag.id)).isArchived).toBe(false);
});
it('keeps restore conflicts recoverable in their row and dialog context', async () => {
  const tag = await api.createTag({ name: 'Race', color: null });
  await api.archiveTag(tag.id);
  vi.spyOn(api, 'restoreTag').mockRejectedValue(
    new ClientError('conflict', 'TAG_NAME_CONFLICT'),
  );
  const el = await page('/tags?archived=true');
  button(el.shadowRoot!, 'Restore tag').click();
  await settle(el);
  button(el.shadowRoot!.querySelector('dialog')!, 'Restore tag').click();
  await settle(el);
  expect(el.shadowRoot!.querySelector('dialog')?.textContent).toContain('Race');
  expect(el.shadowRoot!.querySelector('[role=alert]')?.textContent).toContain(
    'already used',
  );
  expect(api.tags[0]?.isArchived).toBe(true);
  expect(
    button(el.shadowRoot!.querySelector('dialog')!, 'Restore tag').disabled,
  ).toBe(false);
});
it('prevents duplicate mutations and retains form values after unexpected failure', async () => {
  let reject!: (error: unknown) => void;
  const spy = vi.spyOn(api, 'createTag').mockImplementation(
    () =>
      new Promise((_r, j) => {
        reject = j;
      }),
  );
  const el = await page();
  const f = await editor(el);
  input(f, 'name', 'Commute');
  submit(f);
  submit(f);
  await settle(el);
  expect(spy).toHaveBeenCalledTimes(1);
  expect(button(f.shadowRoot!, 'Create tag').disabled).toBe(true);
  reject(
    new ClientError('unexpected', 'INVALID_RESPONSE', crypto.randomUUID()),
  );
  await settle(el);
  await settle(f);
  expect(f.shadowRoot!.querySelector<HTMLInputElement>('#name')!.value).toBe(
    'Commute',
  );
  expect(f.shadowRoot!.querySelector('[role=alert]')?.textContent).toContain(
    'Request ID',
  );
  expect(button(f.shadowRoot!, 'Create tag').disabled).toBe(false);
});
it('warns before dirty dismissal and restores focus after discard', async () => {
  const el = await page();
  const f = await editor(el);
  input(f, 'name', 'Unsaved');
  el.shadowRoot!.querySelector('dialog')!.dispatchEvent(
    new Event('cancel', { cancelable: true }),
  );
  await settle(f);
  expect(f.shadowRoot!.activeElement?.id).toBe('keep-editing');
  button(f.shadowRoot!, 'Keep editing').click();
  await settle(f);
  expect(f.shadowRoot!.activeElement?.id).toBe('name');
  f.requestDismiss();
  await settle(f);
  button(f.shadowRoot!, 'Discard changes').click();
  await settle(el);
  expect(el.shadowRoot!.querySelector('dialog')).toBeNull();
  expect(el.shadowRoot!.activeElement?.textContent?.trim()).toBe('New tag');
});
it('uses the typed HTTP boundary with encoded search and explicit null colour', async () => {
  const tag = await api.createTag({ name: 'Race', color: null });
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [tag] })))
    .mockResolvedValueOnce(new Response(JSON.stringify(tag)));
  const client = createConfigurationApi({ fetch: transport });
  await client.listTags(true, 'Race & rest');
  expect(transport.mock.calls[0]?.[0]).toBe(
    '/api/v1/tags?includeArchived=true&search=Race%20%26%20rest',
  );
  await client.updateTag(tag.id, { color: null });
  expect(transport.mock.calls[1]?.[1]?.body).toBe('{"color":null}');
});

it('explains an empty archived view without suggesting creation of an archived tag', async () => {
  const el = await page('/tags?archived=true');
  expect(el.shadowRoot!.querySelector('.empty')?.textContent).toContain(
    'No archived tags',
  );
  expect(el.shadowRoot!.querySelector('.empty')?.textContent).not.toContain(
    'Create your first tag',
  );
  button(el.shadowRoot!, 'Show active tags').click();
  await settle(el);
  expect(el.shadowRoot!.querySelector('.empty')?.textContent).toContain(
    'Create your first tag',
  );
});

it.each(['archive', 'restore'] as const)(
  'prevents duplicate %s mutations',
  async (action) => {
    const tag = await api.createTag({ name: 'Race', color: null });
    if (action === 'restore') await api.archiveTag(tag.id);
    let finish!: (value: typeof tag) => void;
    const spy = vi
      .spyOn(api, action === 'archive' ? 'archiveTag' : 'restoreTag')
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
    const el = await page('/tags?archived=true');
    const label = action === 'archive' ? 'Archive tag' : 'Restore tag';
    button(el.shadowRoot!, label).click();
    await settle(el);
    const confirm = button(el.shadowRoot!.querySelector('dialog')!, label);
    confirm.click();
    confirm.click();
    await settle(el);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(confirm.disabled).toBe(true);
    finish(tag);
    await settle(el);
    expect(el.shadowRoot!.querySelector('dialog')).toBeNull();
  },
);

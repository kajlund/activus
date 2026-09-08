import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ActivityKindsPage } from '../src/features/activity-kinds/page.js';
import { KindForm } from '../src/features/activity-kinds/kind-form.js';
import { VariantForm } from '../src/features/activity-kinds/variant-form.js';
import {
  MemoryConfigurationApi,
  kindInput,
} from './support/configuration-api.js';
import { ClientError } from '../src/services/configuration-api.js';
let api: MemoryConfigurationApi;
beforeEach(() => {
  api = new MemoryConfigurationApi();
  window.history.replaceState(null, '', '/activity-kinds');
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});
async function settle(element: ActivityKindsPage | KindForm | VariantForm) {
  await element.updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await element.updateComplete;
}
async function page(route = '/activity-kinds') {
  const view = new ActivityKindsPage();
  view.api = api;
  view.measurementApi = api;
  view.route = route;
  document.body.append(view);
  await settle(view);
  return view;
}
function button(root: ShadowRoot | Element, text: string) {
  const result = [...root.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === text,
  );
  if (!result) throw new Error(`Missing button: ${text}`);
  return result;
}
function input(form: KindForm | VariantForm, selector: string, value: string) {
  const field = form.shadowRoot!.querySelector<HTMLInputElement>(selector)!;
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}
it('renders empty and populated states in server order', async () => {
  const view = await page();
  expect(view.shadowRoot!.textContent).toContain('No activity kinds yet');
  await api.createKind({ ...kindInput, name: 'Zulu', sortOrder: 0 });
  await api.createKind({ ...kindInput, name: 'Alpha', sortOrder: 1 });
  await view.load();
  await settle(view);
  expect(
    [...view.shadowRoot!.querySelectorAll('.row-name')].map(
      (n) => n.textContent,
    ),
  ).toEqual(['Zulu', 'Alpha']);
});
it('shows loading and safe errors with request IDs', async () => {
  let reject!: (error: unknown) => void;
  vi.spyOn(api, 'listKinds').mockImplementation(
    () =>
      new Promise((_r, j) => {
        reject = j;
      }),
  );
  const view = await page();
  expect(view.shadowRoot!.textContent).toContain('Loading…');
  const id = crypto.randomUUID();
  reject(new ClientError('network', 'NETWORK_ERROR', id));
  await settle(view);
  expect(view.shadowRoot!.querySelector('[role=alert]')?.textContent).toContain(
    id,
  );
});
it('preserves archived visibility in detail and back URLs', async () => {
  const kind = await api.createKind(kindInput);
  await api.archiveKind(kind.id);
  const view = await page('/activity-kinds?archived=true');
  expect(
    view.shadowRoot!.querySelector('.row-link')?.getAttribute('href'),
  ).toBe(`/activity-kinds/${kind.id}?archived=true`);
  view.route = `/activity-kinds/${kind.id}?archived=true`;
  await settle(view);
  expect(view.shadowRoot!.querySelector('.back')?.getAttribute('href')).toBe(
    '/activity-kinds?archived=true',
  );
  expect(view.shadowRoot!.textContent).toContain('No variants');
});
it('creates a kind with keyboard-usable icon and colour selection', async () => {
  const view = await page();
  button(view.shadowRoot!, 'Add activity kind').click();
  await settle(view);
  const form = view.shadowRoot!.querySelector<KindForm>('kind-form')!;
  await settle(form);
  input(form, '#name', '  Cycling  ');
  form
    .shadowRoot!.querySelector<HTMLInputElement>('input[value=bike]')!
    .click();
  form
    .shadowRoot!.querySelector<HTMLButtonElement>(
      '[aria-label="Blue #527FA5"]',
    )!
    .click();
  form
    .shadowRoot!.querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await settle(view);
  expect(api.kinds[0]).toMatchObject({
    name: 'Cycling',
    iconName: 'bike',
    color: '#527FA5',
  });
  expect(view.shadowRoot!.querySelector('dialog')).toBeNull();
});
it('focuses invalid fields and preserves input after conflicts', async () => {
  const view = await page();
  button(view.shadowRoot!, 'Add activity kind').click();
  await settle(view);
  const form = view.shadowRoot!.querySelector<KindForm>('kind-form')!;
  await settle(form);
  form
    .shadowRoot!.querySelector('form')!
    .dispatchEvent(new Event('submit', { cancelable: true }));
  await settle(form);
  expect(form.shadowRoot!.activeElement?.id).toBe('name');
  expect(form.shadowRoot!.textContent).toContain('1–120');
  await api.createKind(kindInput);
  input(form, '#name', 'Walking');
  form
    .shadowRoot!.querySelector('form')!
    .dispatchEvent(new Event('submit', { cancelable: true }));
  await settle(view);
  await settle(form);
  expect(view.shadowRoot!.querySelector('dialog')).not.toBeNull();
  expect(form.shadowRoot!.querySelector<HTMLInputElement>('#name')!.value).toBe(
    'Walking',
  );
  expect(form.shadowRoot!.textContent).toContain('already used');
});
it('edits a variant and refreshes transactional default selection', async () => {
  const kind = await api.createKind(kindInput);
  const outdoor = await api.createVariant(kind.id, {
    name: 'Outdoor',
    sortOrder: 0,
    isDefault: true,
  });
  await api.createVariant(kind.id, {
    name: 'Treadmill',
    sortOrder: 1,
    isDefault: false,
  });
  const view = await page(`/activity-kinds/${kind.id}`);
  const rows = view.shadowRoot!.querySelectorAll('li.row');
  button(rows[1]!, 'Edit').click();
  await settle(view);
  const form = view.shadowRoot!.querySelector<VariantForm>('variant-form')!;
  await settle(form);
  form.shadowRoot!.querySelector<HTMLInputElement>('[type=checkbox]')!.click();
  form
    .shadowRoot!.querySelector('form')!
    .dispatchEvent(new Event('submit', { cancelable: true }));
  await settle(view);
  expect(api.variants.find((v) => v.id === outdoor.id)?.isDefault).toBe(false);
  expect(api.variants.find((v) => v.name === 'Treadmill')?.isDefault).toBe(
    true,
  );
});
it('requires archive confirmation and supports restore from archived view', async () => {
  const kind = await api.createKind(kindInput);
  const view = await page();
  button(view.shadowRoot!, 'Archive').click();
  await settle(view);
  expect(api.kinds[0]?.isArchived).toBe(false);
  expect(view.shadowRoot!.querySelector('dialog')?.textContent).toContain(
    'default variant is cleared',
  );
  button(view.shadowRoot!.querySelector('dialog')!, 'Archive').click();
  await settle(view);
  expect(api.kinds[0]?.isArchived).toBe(true);
  view.route = '/activity-kinds?archived=true';
  await settle(view);
  button(view.shadowRoot!, 'Restore').click();
  await settle(view);
  button(view.shadowRoot!.querySelector('dialog')!, 'Restore').click();
  await settle(view);
  expect((await api.getKind(kind.id)).isArchived).toBe(false);
});
it('ignores stale responses and aborts superseded and disconnected views', async () => {
  let resolve!: (v: { items: typeof api.kinds }) => void;
  const spy = vi.spyOn(api, 'listKinds').mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const view = await page();
  const signal = (
    spy.mock.calls as unknown as [boolean, AbortSignal][]
  )[0]?.[1];
  view.route = '/activity-kinds?archived=true';
  await settle(view);
  const stale = await api.createKind(kindInput);
  resolve({ items: [stale] });
  await settle(view);
  expect(view.shadowRoot!.querySelector('.row-name')).toBeNull();
  expect(signal?.aborted).toBe(true);
  view.remove();
});
it('shows useful invalid and missing detail states', async () => {
  const view = await page('/activity-kinds/bad');
  expect(view.shadowRoot!.textContent).toContain('Activity kind not found');
  view.route = `/activity-kinds/${crypto.randomUUID()}`;
  await settle(view);
  expect(view.shadowRoot!.textContent).toContain('Activity kind not found');
});

it('protects dirty kind and variant forms but allows clean dismissal', async () => {
  const view = await page();
  button(view.shadowRoot!, 'Add activity kind').click();
  await settle(view);
  const form = view.shadowRoot!.querySelector<KindForm>('kind-form')!;
  await settle(form);
  expect(form.dirty).toBe(false);
  input(form, '#name', 'Unfinished kind');
  await settle(form);
  expect(form.dirty).toBe(true);
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  expect(
    window.dispatchEvent(
      new Event('before-route-change', { cancelable: true }),
    ),
  ).toBe(false);
  button(form.shadowRoot!, 'Cancel').click();
  await settle(view);
  expect(view.shadowRoot!.textContent).toContain(
    'Discard your unsaved configuration',
  );
  button(view.shadowRoot!, 'Discard changes').click();
  await settle(view);
  expect(view.shadowRoot!.querySelector('dialog')).toBeNull();
  const variant = new VariantForm();
  document.body.append(variant);
  await settle(variant);
  expect(variant.dirty).toBe(false);
  input(variant, '#name', 'Trail');
  await settle(variant);
  expect(variant.dirty).toBe(true);
});

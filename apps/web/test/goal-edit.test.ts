import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { CreateGoalRequest, Goal } from '@activus/contracts';
import { sameProgressCriteria } from '../src/features/goals/comparison.js';
import { GoalFormPage } from '../src/features/goals/create-page.js';
import { ClientError } from '../src/services/configuration-api.js';

const id = '11111111-1111-4111-8111-111111111111';
const kindId = '22222222-2222-4222-8222-222222222222';
const tagId = '33333333-3333-4333-8333-333333333333';
const secondTagId = '44444444-4444-4444-8444-444444444444';
const variantId = '55555555-5555-4555-8555-555555555555';
const measurementId = '66666666-6666-4666-8666-666666666666';
const unrelatedId = '77777777-7777-4777-8777-777777777777';
const goal: Goal = {
  id,
  name: 'Run more',
  description: 'A goal',
  activityKindId: kindId,
  activityVariantId: null,
  tagIds: [tagId],
  targetType: 'total_duration',
  targetValue: '5400',
  measurementDefinitionId: null,
  scheduleMode: 'recurring',
  recurrencePeriod: 'week',
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  isArchived: false,
  lifecycle: 'active',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};
const api = (updateGoal = vi.fn().mockResolvedValue(goal), stored = goal) => ({
  getGoal: vi.fn().mockResolvedValue(stored),
  updateGoal,
  createGoal: vi.fn(),
  listKinds: vi.fn().mockResolvedValue({
    items: [{ id: kindId, name: 'Run', isArchived: false }],
  }),
  listTags: vi.fn().mockResolvedValue({
    items: [{ id: tagId, name: 'Outside', isArchived: false }],
  }),
  listVariants: vi.fn().mockResolvedValue({ items: [] }),
  listMeasurements: vi.fn().mockResolvedValue({ items: [] }),
});
async function mount(service = api()) {
  const page = new GoalFormPage();
  page.route = `/goals/${id}/edit`;
  page.api = service as never;
  document.body.append(page);
  await settle(page);
  return { page, service };
}
async function mountCreate() {
  const service = api();
  const page = new GoalFormPage();
  page.route = '/goals/new';
  page.api = service as never;
  document.body.append(page);
  await settle(page);
  return { page, service };
}
async function settle(page: GoalFormPage) {
  for (let i = 0; i < 30; i++) await Promise.resolve();
  await page.updateComplete;
}
function submit(page: GoalFormPage) {
  const form = page.shadowRoot!.querySelector('form')!;
  const button = form.querySelector<HTMLButtonElement>('button.primary')!;
  form.dispatchEvent(
    new SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
      submitter: button,
    }),
  );
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  history.replaceState(null, '', '/');
});

it('keeps only archived references already stored by the goal visible and selected', async () => {
  const stored = {
    ...goal,
    activityVariantId: variantId,
    tagIds: [tagId],
    targetType: 'measurement_total' as const,
    targetValue: '1.00',
    measurementDefinitionId: measurementId,
  };
  const service = api(vi.fn(), stored);
  service.listKinds.mockResolvedValue({
    items: [
      { id: kindId, name: 'Archived run', isArchived: true },
      { id: unrelatedId, name: 'Old swim', isArchived: true },
    ],
  });
  service.listTags.mockResolvedValue({
    items: [
      { id: tagId, name: 'Old outdoors', isArchived: true },
      { id: unrelatedId, name: 'Old race', isArchived: true },
    ],
  });
  service.listVariants.mockResolvedValue({
    items: [
      { id: variantId, name: 'Old trail', isArchived: true },
      { id: unrelatedId, name: 'Old road', isArchived: true },
    ],
  });
  service.listMeasurements.mockResolvedValue({
    items: [
      {
        id: measurementId,
        name: 'Old distance',
        isArchived: true,
        valueType: 'decimal',
        aggregation: 'total',
      },
      {
        id: unrelatedId,
        name: 'Old elevation',
        isArchived: true,
        valueType: 'decimal',
        aggregation: 'total',
      },
    ],
  });
  const { page } = await mount(service);
  const text = page.shadowRoot!.textContent!;
  expect(text).toContain('Archived run (Archived)');
  expect(text).toContain('Old trail (Archived)');
  expect(text).toContain('Old distance (Archived)');
  expect(text).toContain('Old outdoors (Archived)');
  expect(text).not.toContain('Old swim');
  expect(text).not.toContain('Old road');
  expect(text).not.toContain('Old elevation');
  expect(text).not.toContain('Old race');
  expect(
    page.shadowRoot!.querySelector<HTMLSelectElement>('[name=kind]')!.value,
  ).toBe(kindId);
  expect(
    page.shadowRoot!.querySelector<HTMLSelectElement>('[name=variant]')!.value,
  ).toBe(variantId);
  expect(
    page.shadowRoot!.querySelector<HTMLSelectElement>('[name=measurement]')!
      .value,
  ).toBe(measurementId);
  expect(
    page.shadowRoot!.querySelector<HTMLInputElement>(
      `[name=tag][value="${tagId}"]`,
    )!.checked,
  ).toBe(true);
});

it('warns for progress changes but saves name-only changes without warning', async () => {
  const first = await mount();
  first.page.shadowRoot!.querySelector<HTMLInputElement>(
    '[name=hours]',
  )!.value = '2';
  submit(first.page);
  await settle(first.page);
  expect(first.page.shadowRoot!.querySelector('dialog')?.open).toBe(true);
  expect(first.service.updateGoal).not.toHaveBeenCalled();

  document.body.replaceChildren();
  const second = await mount();
  second.page.shadowRoot!.querySelector<HTMLInputElement>(
    '[name=name]',
  )!.value = 'Run farther';
  submit(second.page);
  await settle(second.page);
  expect(second.page.shadowRoot!.querySelector('dialog')).toBeNull();
  expect(second.service.updateGoal).toHaveBeenCalledOnce();
});

it('treats reordered tags and equivalent canonical target values as unchanged', () => {
  const original = {
    ...goal,
    tagIds: [tagId, secondTagId],
    targetType: 'measurement_total' as const,
    targetValue: '001.2300',
    measurementDefinitionId: measurementId,
  };
  const current: CreateGoalRequest = {
    ...original,
    tagIds: [secondTagId, tagId],
    targetValue: '1.23',
  };
  expect(sameProgressCriteria(original, current)).toBe(true);
  expect(sameProgressCriteria(goal, { ...goal, targetValue: 90 * 60 })).toBe(
    true,
  );
  expect(sameProgressCriteria(goal, { ...goal, targetValue: 540 })).toBe(false);
});

it('submits a confirmed change once and keeps entered values when it fails', async () => {
  const update = vi
    .fn()
    .mockRejectedValue(new ClientError('validation', 'GOAL_INVALID'));
  const { page } = await mount(api(update));
  const name = page.shadowRoot!.querySelector<HTMLInputElement>('[name=name]')!;
  name.value = 'Changed';
  page.shadowRoot!.querySelector<HTMLInputElement>('[name=hours]')!.value = '2';
  submit(page);
  await settle(page);
  const confirm = page.shadowRoot!.querySelector<HTMLButtonElement>(
    'dialog button.primary',
  )!;
  confirm.click();
  confirm.click();
  await settle(page);
  expect(update).toHaveBeenCalledOnce();
  expect(name.value).toBe('Changed');
  expect(page.shadowRoot!.textContent).toContain('Check the entered values');
  expect(page.dirty).toBe(true);
});

it('guards dirty Cancel navigation, keeps the complete form, then discards once', async () => {
  const { page } = await mountCreate();
  const name = page.shadowRoot!.querySelector<HTMLInputElement>('[name=name]')!;
  const cancel = page.shadowRoot!.querySelector<HTMLButtonElement>(
    'footer button[type=button]',
  )!;
  name.value = 'New weekly goal';
  name.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  expect(page.dirty).toBe(true);
  expect(
    window.dispatchEvent(new Event('beforeunload', { cancelable: true })),
  ).toBe(false);

  cancel.click();
  await settle(page);
  expect(location.pathname).toBe('/');
  expect(
    page.shadowRoot!.querySelector<HTMLDialogElement>(
      'dialog[data-confirmation=discard]',
    )?.open,
  ).toBe(true);
  page.shadowRoot!.querySelector<HTMLButtonElement>('dialog button')!.click();
  await settle(page);
  expect(name.value).toBe('New weekly goal');
  expect(page.shadowRoot!.activeElement).toBe(cancel);

  cancel.click();
  await settle(page);
  page
    .shadowRoot!.querySelector<HTMLButtonElement>('dialog button.danger')!
    .click();
  expect(location.pathname).toBe('/goals');
});

it('allows pristine and successfully saved forms to navigate without a discard warning', async () => {
  const pristine = await mountCreate();
  pristine.page
    .shadowRoot!.querySelector<HTMLButtonElement>('footer button[type=button]')!
    .click();
  expect(pristine.page.shadowRoot!.querySelector('dialog')).toBeNull();
  expect(location.pathname).toBe('/goals');

  document.body.replaceChildren();
  history.replaceState(null, '', '/');
  const saved = await mount(
    api(
      vi.fn().mockImplementation(async (_id, input) => ({
        ...goal,
        ...input,
        targetValue: String(input.targetValue),
      })),
    ),
  );
  const name =
    saved.page.shadowRoot!.querySelector<HTMLInputElement>('[name=name]')!;
  name.value = 'Saved name';
  name.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  submit(saved.page);
  await settle(saved.page);
  expect(saved.page.dirty).toBe(false);
  expect(
    saved.page.shadowRoot!.querySelector('dialog[data-confirmation=discard]'),
  ).toBeNull();
  expect(location.pathname).toBe('/goals');
});

it('returns a created upcoming goal to its lifecycle view and preserves the view on cancel', async () => {
  const { page, service } = await mountCreate();
  page.route = '/goals/new?view=ended';
  service.createGoal.mockResolvedValue({ ...goal, lifecycle: 'upcoming' });
  const root = page.shadowRoot!;
  const kind = root.querySelector<HTMLSelectElement>('[name=kind]')!;
  kind.value = kindId;
  kind.dispatchEvent(new Event('change', { bubbles: true }));
  await settle(page);
  for (const [name, value] of [
    ['name', 'Next year'],
    ['value', '10'],
    ['start', '2099-01-01'],
    ['end', '2099-12-31'],
  ])
    root.querySelector<HTMLInputElement>(`[name=${name}]`)!.value = value!;
  submit(page);
  await settle(page);
  expect(service.createGoal).toHaveBeenCalledOnce();
  expect(location.pathname + location.search).toBe(
    '/goals?view=upcoming&saved=1',
  );
  document.body.replaceChildren();
  const next = await mountCreate();
  next.page.route = '/goals/new?view=archived';
  await settle(next.page);
  next.page
    .shadowRoot!.querySelector<HTMLButtonElement>('footer button[type=button]')!
    .click();
  expect(location.pathname + location.search).toBe('/goals?view=archived');
});

it('does not become dirty for reordered tags or equivalent canonical values', async () => {
  const stored = {
    ...goal,
    tagIds: [secondTagId, tagId],
    targetType: 'measurement_total' as const,
    targetValue: '001.2300',
    measurementDefinitionId: measurementId,
  };
  const service = api(vi.fn(), stored);
  service.listTags.mockResolvedValue({
    items: [
      { id: tagId, name: 'Outside', isArchived: false },
      { id: secondTagId, name: 'Race', isArchived: false },
    ],
  });
  service.listMeasurements.mockResolvedValue({
    items: [
      {
        id: measurementId,
        name: 'Distance',
        isArchived: false,
        activityVariantId: null,
        valueType: 'decimal',
        aggregation: 'total',
      },
    ],
  });
  const { page } = await mount(service);
  const value =
    page.shadowRoot!.querySelector<HTMLInputElement>('[name=value]')!;
  value.value = '1.23';
  value.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  expect(page.dirty).toBe(false);
});

it('never stacks the recalculation and unsaved-change confirmations', async () => {
  const { page } = await mount();
  const hours =
    page.shadowRoot!.querySelector<HTMLInputElement>('[name=hours]')!;
  hours.value = '2';
  hours.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  submit(page);
  await settle(page);
  expect(page.confirming).toBe(true);
  const navigation = new Event('before-route-change', { cancelable: true });
  expect(window.dispatchEvent(navigation)).toBe(true);
  await settle(page);
  expect(page.leaving).toBe(false);
  expect(page.shadowRoot!.querySelectorAll('dialog')).toHaveLength(1);
});

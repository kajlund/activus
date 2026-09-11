import {
  CreateGoalRequestSchema,
  UpdateGoalRequestSchema,
  type CreateGoalRequest,
  type GoalListQuery,
} from '@activus/contracts';
import { ApiError } from '../../errors.js';
import { parseId } from '../../transport.js';
import { toGoal } from './mapper.js';
import type { GoalRecord, GoalRepository } from './model.js';
import { utcToday, type GoalClock } from './clock.js';
export class GoalService {
  constructor(
    private readonly repository: GoalRepository,
    private readonly clock: GoalClock = utcToday,
  ) {}
  private toGoal(row: GoalRecord) {
    return toGoal(row, this.clock());
  }
  private require(row: GoalRecord | undefined) {
    if (!row) throw new ApiError(404, 'GOAL_NOT_FOUND', 'Goal not found');
    return row;
  }
  private parse(input: unknown, update = false): Record<string, unknown> {
    const parsed = (
      update ? UpdateGoalRequestSchema : CreateGoalRequestSchema
    ).safeParse(input);
    if (!parsed.success)
      throw new ApiError(400, 'GOAL_INVALID', 'Invalid goal input');
    return parsed.data;
  }
  async list(q: GoalListQuery) {
    return {
      items: (await this.repository.list(q, this.clock())).map((row) =>
        this.toGoal(row),
      ),
    };
  }
  async get(id: string) {
    return this.toGoal(
      this.require(await this.repository.find(parseId(id, 'GOAL_INVALID'))),
    );
  }
  async create(input: unknown) {
    const value = this.parse(input) as CreateGoalRequest;
    await this.repository.validateReferences(value, true);
    return this.toGoal(await this.repository.create(value));
  }
  async update(id: string, input: unknown) {
    const current = this.require(
      await this.repository.find(parseId(id, 'GOAL_INVALID')),
    );
    if (current.archivedAt)
      throw new ApiError(
        409,
        'GOAL_ARCHIVED',
        'Archived goals cannot be updated',
      );
    const patch = this.parse(input, true);
    const {
      id: _id,
      archivedAt: _archivedAt,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...definition
    } = current;
    void [_id, _archivedAt, _createdAt, _updatedAt];
    const complete = {
      ...definition,
      targetValue:
        current.targetType === 'measurement_total'
          ? current.targetValue
          : Number(current.targetValue),
      ...patch,
      tagIds: Array.isArray(patch.tagIds) ? patch.tagIds : current.tagIds,
    };
    const parsed = CreateGoalRequestSchema.safeParse(complete);
    if (!parsed.success)
      throw new ApiError(400, 'GOAL_INVALID', 'Invalid goal input');
    const value = parsed.data;
    await this.repository.validateReferences(value, true, current);
    return this.toGoal(
      this.require(await this.repository.update(current.id, value)),
    );
  }
  async archive(id: string) {
    return this.toGoal(
      this.require(
        await this.repository.setArchived(parseId(id, 'GOAL_INVALID'), true),
      ),
    );
  }
  async restore(id: string) {
    const row = this.require(
      await this.repository.find(parseId(id, 'GOAL_INVALID')),
    );
    if (!row.archivedAt) return this.toGoal(row);
    try {
      await this.repository.validateReferences(row as never, true);
    } catch (error) {
      throw new ApiError(
        409,
        'GOAL_RESTORE_BLOCKED',
        error instanceof ApiError
          ? error.message
          : 'Goal cannot be restored because a referenced definition is unavailable',
      );
    }
    return this.toGoal(
      this.require(await this.repository.setArchived(row.id, false)),
    );
  }
}

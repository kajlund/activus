import type { CreateGoalRequest, GoalListQuery } from '@activus/contracts';
export type GoalRecord = {
  id: string;
  name: string;
  description: string | null;
  targetType: 'activity_count' | 'total_duration' | 'measurement_total';
  targetValue: string;
  measurementDefinitionId: string | null;
  activityKindId: string;
  activityVariantId: string | null;
  scheduleMode: 'fixed' | 'recurring';
  recurrencePeriod: 'week' | 'month' | 'year' | null;
  archivedAt: Date | null;
  startDate: string;
  endDate: string;
  createdAt: Date;
  updatedAt: Date;
  tagIds: string[];
};
export interface GoalRepository {
  list(query: GoalListQuery): Promise<GoalRecord[]>;
  find(id: string): Promise<GoalRecord | undefined>;
  create(input: CreateGoalRequest): Promise<GoalRecord>;
  update(id: string, input: CreateGoalRequest): Promise<GoalRecord | undefined>;
  setArchived(id: string, archived: boolean): Promise<GoalRecord | undefined>;
  validateReferences(input: CreateGoalRequest, active: boolean): Promise<void>;
}

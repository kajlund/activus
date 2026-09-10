import { sql } from 'drizzle-orm';
import { activities, activityTags, goals, goalTags } from '../../db/schema.js';

// All goal progress and qualifying-activity reads join goals and activities,
// then apply this one scope predicate. EXISTS keeps multi-tag matches unique.
export function goalQualification() {
  return sql`${activities.activityKindId} = ${goals.activityKindId}
    AND (${goals.activityVariantId} IS NULL OR ${activities.activityVariantId} = ${goals.activityVariantId})
    AND ${activities.activityDate} BETWEEN ${goals.startDate} AND ${goals.endDate}
    AND NOT EXISTS (SELECT 1 FROM ${goalTags} WHERE ${goalTags.goalId} = ${goals.id}
      AND NOT EXISTS (SELECT 1 FROM ${activityTags} WHERE ${activityTags.activityId} = ${activities.id} AND ${activityTags.tagId} = ${goalTags.tagId}))`;
}

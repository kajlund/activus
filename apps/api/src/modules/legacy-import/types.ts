export const collections = ['kinds', 'activities'] as const;
export type Collection = (typeof collections)[number];
export type RawDocument = Record<string, unknown>;
export interface SourceIdentity {
  system: 'legacy-activus-mongodb';
  datasetId: string | null;
  collection: Collection;
  id: string | null;
}
export interface Issue {
  severity: 'error' | 'warning';
  code: string;
  collection: Collection | 'package';
  line: number;
  sourceId: string | null;
  field: string;
  message: string;
}
export type AddIssue = (
  severity: Issue['severity'],
  code: string,
  field: string,
  message: string,
) => void;
export interface SourceItem {
  line: number;
  raw: unknown;
  parseError: string | null;
}
export interface FileSummary {
  collection: Collection;
  filename: string;
  bytes: number;
  sha256: string;
  recordsRead: number;
  blankLines: number;
}
export interface DecodedKind {
  id: string;
  name: string;
  iconName: string;
  legacyKindId: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}
export const numberFields = [
  'distance',
  'duration',
  'elevation',
  'ascent',
  'calories',
  'steps',
  'avgHR',
  'cadenceAvg',
] as const;
export type NumberField = (typeof numberFields)[number];
export interface DecodedActivity {
  id: string;
  kindId: string;
  ownerPresent: boolean;
  when: string;
  title: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  numbers: Partial<Record<NumberField, string>>;
}
export interface TargetMapping {
  kind: string | null;
  variant: string | null;
  resolved: boolean;
}
export interface MeasurementCandidate {
  field: Exclude<NumberField, 'duration' | 'elevation'>;
  sourceField: NumberField;
  value: string;
  valueType: 'decimal' | 'integer';
  name: string;
  canonicalUnit: string | null;
  displayUnit: string | null;
  precision: number | null;
  resolved: boolean;
}
export interface ActivityCandidate {
  source: SourceIdentity;
  sourceExternalId: string;
  kindSourceId: string;
  target: TargetMapping;
  activityDate: string | null;
  startedAt: string | null;
  startResolved: boolean;
  durationSeconds: number | null;
  durationResolved: boolean;
  name: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  measurements: MeasurementCandidate[];
  tagIds: [];
  effort: null;
  feeling: null;
}
export interface KindCandidate {
  source: SourceIdentity;
  target: TargetMapping;
  iconName: string;
  color: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: null;
  primaryMeasurementDefinitionId: null;
}
export interface RecordResult {
  collection: Collection;
  line: number;
  sourceId: string | null;
  decoded: boolean;
  status: 'normalizable' | 'blocked' | 'skipped';
  candidate:
    | KindCandidate
    | (Omit<ActivityCandidate, 'name' | 'notes'> & {
        hasName: boolean;
        hasNotes: boolean;
      })
    | null;
}

export type CurrentAssessmentStatus = 'draft' | 'reviewer_ready' | 'in_review' | 'approved' | 'planning_approved' |
  'changes_requested' | 'rejected' | 'govern_resolved' | 'handed_off';

export interface CurrentAssessmentCaseSummary {
  id: string;
  processId: string;
  status: CurrentAssessmentStatus;
  version: number;
  updatedAt: string;
  hasCurrentDecision: boolean;
}

const statusLabels: Record<CurrentAssessmentStatus, string> = {
  draft: 'Working draft',
  reviewer_ready: 'Ready for review',
  in_review: 'In review',
  approved: 'Approved',
  planning_approved: 'Approved for planning',
  changes_requested: 'Changes requested',
  rejected: 'Rejected',
  govern_resolved: 'Govern resolved',
  handed_off: 'Handed off',
};

const inMotionStatuses = new Set<CurrentAssessmentStatus>([
  'draft', 'reviewer_ready', 'in_review', 'changes_requested',
]);

export interface CurrentAssessmentCatalogEntry {
  processId: string;
  statusLabel: string;
  scored: boolean;
  inMotion: boolean;
}

export type CurrentAssessmentCatalogReadState = 'loading' | 'ready' | 'unavailable';

export const presentCurrentAssessmentCatalogStatus = (
  state: CurrentAssessmentCatalogReadState,
  entry: CurrentAssessmentCatalogEntry | undefined,
): string => state === 'loading' ? 'Checking current assessment'
  : state === 'unavailable' ? 'Current assessment unavailable'
    : entry?.statusLabel ?? 'Not started';

export const presentProcessCatalogAssessmentStatus = (input: {
  usesLocalCatalog: boolean;
  localStatus: string;
  state: CurrentAssessmentCatalogReadState;
  entry: CurrentAssessmentCatalogEntry | undefined;
}): string => input.usesLocalCatalog
  ? input.localStatus
  : presentCurrentAssessmentCatalogStatus(input.state, input.entry);

export const presentCurrentAssessmentCatalogCount = (
  state: CurrentAssessmentCatalogReadState,
  count: number,
): number | '—' => state === 'ready' ? count : '—';

export const selectCurrentAssessmentCases = (
  orderedCases: readonly CurrentAssessmentCaseSummary[],
): CurrentAssessmentCaseSummary[] => {
  const selected = new Map<string, CurrentAssessmentCaseSummary>();
  for (const currentCase of orderedCases) {
    if (!selected.has(currentCase.processId)) selected.set(currentCase.processId, currentCase);
  }
  return [...selected.values()];
};

export const buildCurrentAssessmentCatalog = (
  processIds: readonly string[],
  currentCases: readonly CurrentAssessmentCaseSummary[],
): CurrentAssessmentCatalogEntry[] => {
  const requested = new Set(processIds);
  const byProcess = new Map(selectCurrentAssessmentCases(currentCases.filter(item => requested.has(item.processId)))
    .map(item => [item.processId, item]));
  return processIds.map(processId => {
    const current = byProcess.get(processId);
    return current ? {
      processId,
      statusLabel: statusLabels[current.status],
      scored: current.hasCurrentDecision,
      inMotion: inMotionStatuses.has(current.status),
    } : {
      processId,
      statusLabel: 'Not started',
      scored: false,
      inMotion: false,
    };
  });
};

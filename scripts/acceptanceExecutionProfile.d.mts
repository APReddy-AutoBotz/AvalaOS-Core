export type AcceptanceExecutionKind = 'hosted_preview' | 'local_source_fixture' | 'declaration_only';

export interface AcceptanceExecutionProfile {
  schemaVersion: 'acceptance-execution-profile-v1';
  evidenceKind: 'hosted-preview-acceptance' | 'exact-head-synthetic-regression' | 'acceptance-catalog-declaration';
  executionKind: AcceptanceExecutionKind;
  releaseSha: string;
  checkoutSha: string | null;
  sourceIdentity: 'committed_exact_head' | 'governed_working_tree_candidate' | 'catalog_declaration';
  invocationId: string | null;
  targetOrigin: string | null;
  deployId: string | null;
}

export interface AcceptanceReportMetadata {
  schemaVersion: 'acceptance-report-profile-v1';
  ci: Record<string, never>;
  evidenceKind: AcceptanceExecutionProfile['evidenceKind'];
  executionKind: AcceptanceExecutionKind;
  exactCommand: string[];
  configPath: string;
  sourcePaths: string[];
  exactHead: string;
  targetOrigin: string | null;
  deployId: string | null;
  sourceIdentity?: 'governed_working_tree_candidate';
  invocationId?: string;
}

export interface FullPageAxeCheckResult {
  id: string;
}

export interface FullPageAxeNodeResult {
  any: readonly FullPageAxeCheckResult[];
  all: readonly FullPageAxeCheckResult[];
  none: readonly FullPageAxeCheckResult[];
}

export interface FullPageAxeRuleResult {
  id: string;
  nodes: readonly FullPageAxeNodeResult[];
}

export interface FullPageAxeResults {
  passes: readonly FullPageAxeRuleResult[];
  violations: readonly FullPageAxeRuleResult[];
  incomplete: readonly FullPageAxeRuleResult[];
}

export type FullPageContrastClassification = 'empty_scan' | 'violations_detected' | 'unresolved_manual' | 'resolved';

export interface FullPageContrastDiagnostic {
  resultOrdinal: number;
  nodeCount: number;
  reasonCategoryCounts: Readonly<Partial<Record<'color-contrast' | 'unknown_reason', number>>>;
}

export interface FullPageContrastSummary {
  classification: FullPageContrastClassification;
  positiveNodeCount: number;
  violationNodeCount: number;
  incompleteNodeCount: number;
  observedNodeCount: number;
  incompleteResultCount: number;
  diagnostics: readonly Readonly<FullPageContrastDiagnostic>[];
}

export interface FullPageContrastAttachment {
  name: string;
  contentType: 'application/json';
  body: string;
}

export function decodeAcceptanceExecutionProfile(
  environment: Record<string, string | undefined>,
  options?: { expectedCheckoutSha?: string },
): AcceptanceExecutionProfile;

export function createAcceptanceReportMetadata(input: {
  profile: AcceptanceExecutionProfile;
  exactCommand: string[];
  configPath: string;
  sourcePaths: string[];
}): AcceptanceReportMetadata;

export function createSyntheticRegressionOutputRoot(input: {
  profile: AcceptanceExecutionProfile;
  reportArea: string;
}): string;

export function summarizeFullPageColorContrast(results: FullPageAxeResults): Readonly<FullPageContrastSummary>;

export function createFullPageContrastAttachment(input: {
  results: FullPageAxeResults;
  metadata: Record<string, unknown>;
  persona: string;
  profile: 'initial-entry' | 'representative-surface';
  project: string;
  test: string;
  observedAt: string;
}): Readonly<FullPageContrastAttachment>;

export function verifyFullPageContrastAttachments(input: {
  testId: string | undefined;
  title: string;
  project: string;
  attempt: {
    startTime?: unknown;
    duration?: unknown;
    attachments?: unknown;
    [key: string]: unknown;
  };
  metadata: Record<string, unknown>;
}): Readonly<{ summaryCount: number; unresolvedPersonaCount: number }>;

export function verifySyntheticRegressionResultInventory(input: {
  report: unknown;
  expectedMetadata: AcceptanceReportMetadata;
  expectedProjects: string[];
  expectedTestIds: string[];
  executableTestIds: string[];
}): Readonly<{ total: number; passed: number; skipped: number }>;

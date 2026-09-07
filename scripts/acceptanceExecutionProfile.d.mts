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

export function verifySyntheticRegressionResultInventory(input: {
  report: unknown;
  expectedMetadata: AcceptanceReportMetadata;
  expectedProjects: string[];
  expectedTestIds: string[];
  executableTestIds: string[];
}): Readonly<{ total: number; passed: number; skipped: number }>;

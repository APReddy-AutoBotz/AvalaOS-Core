export interface HostedAcceptanceWorkflowRuntime {
  authority: 'github-actions';
  workflowPath: string;
  workflowRef: string;
  repository: string;
  eventName: string;
  runId: string;
  runAttempt: string;
  workflowSha: string;
  releaseSha: string;
}

export const EXHAUSTIVE_ACCEPTANCE_WORKFLOW: '.github/workflows/exhaustive-acceptance.yml';
export const PREVIEW_EXHAUSTIVE_BROWSER_WORKFLOW: '.github/workflows/preview-exhaustive-browser-qa.yml';

export function resolveHostedAcceptanceWorkflowPath(input: {
  environment: Record<string, string | undefined>;
  allowedWorkflowPaths: string[];
}): string;

export function createHostedAcceptanceWorkflowRuntime(input: {
  environment: Record<string, string | undefined>;
  workflowPath: string;
  releaseSha: string;
}): Readonly<HostedAcceptanceWorkflowRuntime> | null;

export function deriveExpectedHostedAcceptanceMetadata(input: {
  environment: Record<string, string | undefined>;
  exactCommand: string[];
  configPath: string;
  sourcePaths: string[];
  workflowPath: string;
}): Readonly<Record<string, unknown>>;

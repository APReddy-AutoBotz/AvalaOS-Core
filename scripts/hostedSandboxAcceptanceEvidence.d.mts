export interface HostedSandboxCatalogCase {
  testId: string;
  fixture: string;
  environment: string;
  expectedMutationCount: number;
  [key: string]: unknown;
}

export interface HostedSandboxExecutionBinding {
  testId: string;
  scenario: string | null;
  projects: string[];
  [key: string]: unknown;
}

export interface HostedSandboxMeasurement {
  targetActions: string[];
  supportingActions: string[];
}

export interface HostedSandboxAttachment {
  name: 'hosted-sandbox-acceptance-v1';
  contentType: 'application/json';
  body: string;
}

export const HOSTED_SANDBOX_ACCEPTANCE_CASES: Readonly<Record<string, Readonly<{
  scenario: string;
  targetActions: readonly string[];
}>>>;

export function createHostedSandboxAcceptanceAttachment(input: {
  testCase: HostedSandboxCatalogCase;
  binding: HostedSandboxExecutionBinding;
  metadata: Record<string, unknown>;
  project: string;
  measurement: HostedSandboxMeasurement;
  observedAt: string;
}): Readonly<HostedSandboxAttachment>;

export function verifyHostedSandboxAttachments(input: {
  testCase: HostedSandboxCatalogCase;
  binding: HostedSandboxExecutionBinding;
  executions: unknown[];
}): Readonly<{
  scope: Readonly<{
    evidenceScope: 'executed-hosted-sandbox-local';
    fixtureId: 'synthetic-default';
  }>;
  actual: Readonly<{
    logicalMutationCount: number;
    byProject: Readonly<Record<string, Readonly<{
      targetMutationCount: number;
      supportingActionCount: number;
    }>>>;
  }>;
}>;

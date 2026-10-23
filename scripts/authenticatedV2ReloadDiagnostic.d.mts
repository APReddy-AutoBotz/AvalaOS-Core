export type AuthenticatedAcceptanceMode = 'full_acceptance' | 'v2_primary_prefix_diagnostic' | 'reviewer_selection_diagnostic';
export type AuthenticatedV2ReloadPhase = 'before-create' | 'before-reload' | 'after-reload';
export type AuthenticatedV2ReloadReadStage =
  | 'case-discovery'
  | 'case'
  | 'decision'
  | 'draft-head'
  | 'primitives'
  | 'edges'
  | 'decision-points'
  | 'exception-paths'
  | 'application-assets'
  | 'application-interactions'
  | 'evidence-links';

export interface AuthenticatedV2ReloadReadStageRow {
  stage: AuthenticatedV2ReloadReadStage;
  status: 'passed' | 'failed' | 'not_reached';
  httpStatus: number | null;
  rowCount: number | null;
  lifecycle: {
    requested: number;
    responseStarted: number;
    completed: number;
    transportFailed: number;
    pending: number;
    bodyCompleted: number;
    bodyFailed: number;
    bodyPending: number;
    transportFailures: {
      aborted: number;
      timeout: number;
      connection: number;
      protocol: number;
      blocked: number;
      other: number;
    };
  };
}

export interface AuthenticatedV2ReloadBrowserSnapshot {
  sessionObserved: boolean;
  selectedScopeObserved: boolean;
  selectedProcessObserved: boolean;
  serverContextObserved: boolean;
  resumedDraftRendered: boolean;
  failureRendered: boolean;
  readStages: AuthenticatedV2ReloadReadStageRow[];
}

export interface AuthenticatedV2ReloadCheckpointRequest {
  schemaVersion: 'authenticated-v2-reload-checkpoint-v2';
  phase: AuthenticatedV2ReloadPhase;
  projectName: 'desktop-chromium';
  persona: 'author';
  accessToken: string | null;
  browser: AuthenticatedV2ReloadBrowserSnapshot;
}

export const AUTHENTICATED_ACCEPTANCE_MODES: readonly AuthenticatedAcceptanceMode[];
export const AUTHENTICATED_V2_RELOAD_CHECKPOINT_SCHEMA: 'authenticated-v2-reload-checkpoint-v2';
export const AUTHENTICATED_V2_RELOAD_DIAGNOSTIC_SCHEMA: 'authenticated-v2-primary-prefix-diagnostic-v2';
export const AUTHENTICATED_V2_RELOAD_PHASES: readonly AuthenticatedV2ReloadPhase[];
export const AUTHENTICATED_V2_RELOAD_READ_STAGES: readonly AuthenticatedV2ReloadReadStage[];
export const AUTHENTICATED_V2_RELOAD_COUNT_KEYS: readonly string[];
export function authenticatedAcceptanceMode(environment?: Record<string, string | undefined>): AuthenticatedAcceptanceMode;
export function emptyAuthenticatedV2ReloadReadStages(): AuthenticatedV2ReloadReadStageRow[];
export function validateAuthenticatedV2ReloadReadStages(value: unknown): readonly AuthenticatedV2ReloadReadStageRow[];
export function validateAuthenticatedV2ReloadCheckpoint(input: unknown): Readonly<AuthenticatedV2ReloadCheckpointRequest>;
export function authenticatedV2ReloadProjectionCounts(frame: unknown): Readonly<Record<string, number>>;
export function buildAuthenticatedV2ReloadDiagnostic(input: unknown): unknown;

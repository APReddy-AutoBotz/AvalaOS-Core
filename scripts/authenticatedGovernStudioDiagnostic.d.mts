export type GovernStudioDiagnosticMode = 'govern_studio_diagnostic';
export declare const AUTHENTICATED_GOVERN_STUDIO_DIAGNOSTIC_SCHEMA: 'authenticated-govern-studio-diagnostic-v1';
export declare const AUTHENTICATED_GOVERN_STUDIO_DIAGNOSTIC_MAX_BYTES: 24576;
export declare const AUTHENTICATED_GOVERN_STUDIO_ACTOR_LIMIT_MS: 15000;
export declare const AUTHENTICATED_GOVERN_STUDIO_PREREQUISITE_CASE_IDS: readonly string[];
export declare const AUTHENTICATED_GOVERN_STUDIO_TARGET_CASE_IDS: readonly string[];
export declare const AUTHENTICATED_GOVERN_STUDIO_CASE_IDS: readonly string[];
export declare const AUTHENTICATED_GOVERN_STUDIO_ACTION_CONTRACT: readonly Readonly<{
  key: string; commandType: string; persona: string; status: number;
}>[];
export declare function buildAuthenticatedGovernStudioDiagnostic(input: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>;
export declare function validateAuthenticatedGovernStudioDiagnostic(input: unknown): Readonly<Record<string, unknown>> | null;

export type V2FullPrefixReproductionVariant = 'immediate' | 'barrier';

export function primeV2FullPrefixFixtureSession(
  page: Readonly<{ addInitScript: (script: (input: Readonly<{ key: string; value: string }>) => void,
    input: Readonly<{ key: string; value: string }>) => Promise<unknown> }>,
  actor: Readonly<{ token: string; user: Readonly<{ id: string; email: string }> }>,
  storageKey: string,
): Promise<boolean>;

export function resolveV2FullPrefixLocalSelection(input: Readonly<{
  variant: string | undefined;
  authenticated: boolean;
  hosted: boolean;
  mode: 'full_acceptance' | 'v2_primary_prefix_diagnostic' | 'reviewer_selection_diagnostic'
    | 'govern_studio_diagnostic';
}>): V2FullPrefixReproductionVariant | null;

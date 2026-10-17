export type V2FullPrefixReproductionVariant = 'immediate' | 'barrier';

export function resolveV2FullPrefixLocalSelection(input: Readonly<{
  variant: string | undefined;
  authenticated: boolean;
  hosted: boolean;
  mode: 'full_acceptance' | 'v2_primary_prefix_diagnostic';
}>): V2FullPrefixReproductionVariant | null;

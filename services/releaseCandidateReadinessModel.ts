export type RcProofState = 'proven_ci_or_local_synthetic' | 'configured_not_live_verified' | 'not_proven_hosted_or_live';

export interface RcJourneyHandoff {
  stage: 'Assess' | 'Govern' | 'Studio' | 'Delivery' | 'Monitor';
  resourceId: string;
  evidenceRef: string;
  versionRef: string;
  authority: string;
}

export const RC_SEED_HEAD = 'ce8d92415e8b0ee42f7fdfe034310a5246dc132f';

export const CANONICAL_RC_JOURNEY: readonly RcJourneyHandoff[] = [
  { stage: 'Assess', resourceId: 'assess-proc-ap-invoice-exception', evidenceRef: 'proc-ap-invoice-exception', versionRef: 'assess-core-2026-05', authority: 'Deterministic server scoring; AI is not decision authority.' },
  { stage: 'Govern', resourceId: 'proc-ap-invoice-exception', evidenceRef: 'assess-proc-ap-invoice-exception', versionRef: 'assess-core-2026-05', authority: 'Human review and approval remain mandatory for governed risk.' },
  { stage: 'Studio', resourceId: 'docgen-ap-invoice-exception', evidenceRef: 'assess-proc-ap-invoice-exception', versionRef: 'governed-artifact-revision', authority: 'Immutable source lineage and governed artifact revision authority.' },
  { stage: 'Delivery', resourceId: 'proj-ap-invoice-exception', evidenceRef: 'docgen-ap-invoice-exception', versionRef: 'pack-ap-invoice-exception', authority: 'Approved handoff only; retries retain receipt/effect identity.' },
  { stage: 'Monitor', resourceId: 'pack-ap-invoice-exception', evidenceRef: 'proj-ap-invoice-exception', versionRef: 'pack-ap-invoice-exception', authority: 'Read-only lineage, retry, reconciliation, and blocker projection.' },
] as const;

export const RC_MODULE_EVIDENCE = [
  ['Core', 'proven_ci_or_local_synthetic', 'Core CI source/unit/build gates'],
  ['Enterprise Intelligence / BYOK', 'proven_ci_or_local_synthetic', 'Synthetic provider and secret-boundary suites; no live provider proof'],
  ['Trust Assurance', 'proven_ci_or_local_synthetic', 'Synthetic claim/evidence/publication authority suites'],
  ['Hosted platform', 'not_proven_hosted_or_live', 'No hosted deployment, provider, Vault, or production validation'],
] as const satisfies readonly (readonly [string, RcProofState, string])[];

export function releaseCandidateIdentity(buildSha?: string) {
  const normalized = buildSha?.trim();
  return {
    seedHead: RC_SEED_HEAD,
    buildHead: normalized || 'not injected',
    buildIdentityProven: Boolean(normalized && /^[0-9a-f]{40}$/.test(normalized)),
  };
}

export function validateCanonicalRcJourney(journey: readonly RcJourneyHandoff[] = CANONICAL_RC_JOURNEY): string[] {
  const expected = ['Assess', 'Govern', 'Studio', 'Delivery', 'Monitor'];
  const errors: string[] = [];
  if (journey.map(item => item.stage).join('>') !== expected.join('>')) errors.push('Canonical stage order is incomplete.');
  journey.forEach((item, index) => {
    if (!item.resourceId || !item.evidenceRef || !item.versionRef) errors.push(`${item.stage} lineage is incomplete.`);
    if (index > 0 && !journey.slice(0, index).some(previous => previous.resourceId === item.evidenceRef)) {
      errors.push(`${item.stage} evidence does not reference an earlier canonical resource.`);
    }
  });
  return errors;
}

export type RcProofState = 'proven_exact_sha_ci' | 'configured_not_live_verified' | 'not_run_on_candidate' | 'not_proven_hosted_or_live';

export interface RcJourneyHandoff {
  stage: 'Assess' | 'Govern' | 'Studio' | 'Delivery' | 'Monitor';
  fixtureId: string;
  fixtureEvidenceRef: string;
  fixtureVersionRef: string;
  authorityBoundary: string;
}

export const RC_SEED_HEAD = 'ce8d92415e8b0ee42f7fdfe034310a5246dc132f';

/**
 * Presentation-only demo lineage. These IDs come from data/mockData.ts and are
 * not server-authoritative resource, receipt, evidence, or governed revision IDs.
 */
export const CANONICAL_RC_JOURNEY: readonly RcJourneyHandoff[] = [
  { stage: 'Assess', fixtureId: 'assess-proc-ap-invoice-exception', fixtureEvidenceRef: 'proc-ap-invoice-exception', fixtureVersionRef: 'assess-core-2026-05', authorityBoundary: 'Synthetic display of deterministic scoring; server commits remain the only scoring authority.' },
  { stage: 'Govern', fixtureId: 'proc-ap-invoice-exception', fixtureEvidenceRef: 'assess-proc-ap-invoice-exception', fixtureVersionRef: 'assess-core-2026-05', authorityBoundary: 'Synthetic display only; server-authorized human review and approval remain mandatory.' },
  { stage: 'Studio', fixtureId: 'docgen-ap-invoice-exception', fixtureEvidenceRef: 'assess-proc-ap-invoice-exception', fixtureVersionRef: 'legacy-demo-document-generation', authorityBoundary: 'Legacy demo DocumentGeneration; not a canonical governed Studio aggregate or revision.' },
  { stage: 'Delivery', fixtureId: 'proj-ap-invoice-exception', fixtureEvidenceRef: 'docgen-ap-invoice-exception', fixtureVersionRef: 'demo-delivery-project', authorityBoundary: 'Synthetic project display; authoritative handoff requires the server-committed approved artifact and package version.' },
  { stage: 'Monitor', fixtureId: 'pack-ap-invoice-exception', fixtureEvidenceRef: 'proj-ap-invoice-exception', fixtureVersionRef: 'demo-delivery-pack', authorityBoundary: 'Synthetic readiness display; server package/work-item rows are authoritative.' },
] as const;

export const RC_MODULE_EVIDENCE = [
  ['Core', 'not_run_on_candidate', 'Consult the exact-SHA manifest; the UI does not infer workflow success.'],
  ['Enterprise Intelligence / BYOK', 'not_run_on_candidate', 'Consult exact-SHA workflow provenance; no live provider proof.'],
  ['Trust Assurance', 'not_run_on_candidate', 'Not run on this candidate unless an exact-SHA run is listed in the manifest.'],
  ['Hosted platform', 'not_proven_hosted_or_live', 'No hosted deployment, provider, Vault, or production validation.'],
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
    if (!item.fixtureId || !item.fixtureEvidenceRef || !item.fixtureVersionRef) errors.push(`${item.stage} fixture lineage is incomplete.`);
    if (index > 0 && !journey.slice(0, index).some(previous => previous.fixtureId === item.fixtureEvidenceRef)) {
      errors.push(`${item.stage} fixture evidence does not reference an earlier presentation fixture.`);
    }
  });
  return errors;
}

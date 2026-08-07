import { ASSURANCE_LIFECYCLES, EVIDENCE_FRESHNESS, EVIDENCE_LIFECYCLES, type BuyerSafeProjection, type InternalAssuranceProjection } from './contracts';
import { PROOF_BOUNDARIES, PROOF_STATUSES, READINESS_DOMAINS } from '../trustCenterModel';

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('MALFORMED_TRUST_ASSURANCE_RESPONSE');
  return value as Record<string, unknown>;
};
const exact = (row: Record<string, unknown>, keys: readonly string[]) => {
  if (Object.keys(row).length !== keys.length || Object.keys(row).some(key => !keys.includes(key))) throw new Error('MALFORMED_TRUST_ASSURANCE_RESPONSE');
};
const text = (value: unknown, max = 2048): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('MALFORMED_TRUST_ASSURANCE_RESPONSE');
  return value;
};
const iso = (value: unknown): string => {
  const result = text(value, 64); if (!Number.isFinite(Date.parse(result))) throw new Error('MALFORMED_TRUST_ASSURANCE_RESPONSE'); return result;
};
const list = (value: unknown): unknown[] => { if (!Array.isArray(value) || value.length > 500) throw new Error('MALFORMED_TRUST_ASSURANCE_RESPONSE'); return value; };
const oneOf = <T extends string>(value: unknown, values: readonly T[]): T => { if (typeof value !== 'string' || !values.includes(value as T)) throw new Error('MALFORMED_TRUST_ASSURANCE_RESPONSE'); return value as T; };

export const decodeBuyerSafeProjection = (value: unknown): BuyerSafeProjection => {
  const row = object(value); exact(row, ['mode', 'publication', 'claims']);
  if (row.mode !== 'published_snapshot') throw new Error('MALFORMED_TRUST_ASSURANCE_RESPONSE');
  const publication = object(row.publication); exact(publication, ['publicId', 'snapshotHash', 'publishedAt']);
  return {
    mode: 'published_snapshot',
    publication: { publicId: text(publication.publicId, 100), snapshotHash: text(publication.snapshotHash, 64), publishedAt: iso(publication.publishedAt) },
    claims: list(row.claims).map(value => {
      const claim = object(value); exact(claim, ['wording', 'effectiveProofStatus', 'proofBoundary', 'lastReviewedAt', 'evidence', 'limitationDisclosure', 'doesNotProve']);
      return {
        wording: text(claim.wording), effectiveProofStatus: oneOf(claim.effectiveProofStatus, PROOF_STATUSES), proofBoundary: oneOf(claim.proofBoundary, PROOF_BOUNDARIES), lastReviewedAt: iso(claim.lastReviewedAt),
        evidence: list(claim.evidence).map(value => { const item = object(value); exact(item, ['summary', 'referenceType', 'referenceValue', 'freshness']); return { summary: text(item.summary), referenceType: text(item.referenceType, 64), referenceValue: text(item.referenceValue, 512), freshness: oneOf(item.freshness, EVIDENCE_FRESHNESS) }; }),
        limitationDisclosure: text(claim.limitationDisclosure), doesNotProve: list(claim.doesNotProve).map(value => text(value)),
      };
    }),
  };
};

export const decodeInternalProjection = (value: unknown): InternalAssuranceProjection => {
  const row = object(value); exact(row, ['mode', 'organizationId', 'workspaceId', 'authorizationVersion', 'readOnly', 'claims', 'evidence', 'reviewQueueCount', 'snapshotHistory', 'currentPublication']);
  if (row.mode !== 'server_authoritative' || typeof row.readOnly !== 'boolean' || !Number.isSafeInteger(row.authorizationVersion) || !Number.isSafeInteger(row.reviewQueueCount)) throw new Error('MALFORMED_TRUST_ASSURANCE_RESPONSE');
  const claims = list(row.claims).map(value => { const c = object(value); exact(c, ['claimVersionId','claimId','version','readinessDomain','claimText','buyerSafeWording','proposedProofStatus','effectiveProofStatus','proofBoundary','limitationDisclosure','doesNotProve','canonicalHash','ownerDisplayName','lifecycle','blockedReasons']); return { ...c, readinessDomain: oneOf(c.readinessDomain, READINESS_DOMAINS), proposedProofStatus: oneOf(c.proposedProofStatus, PROOF_STATUSES), effectiveProofStatus: oneOf(c.effectiveProofStatus, PROOF_STATUSES), proofBoundary: oneOf(c.proofBoundary, PROOF_BOUNDARIES), lifecycle: oneOf(c.lifecycle, ASSURANCE_LIFECYCLES), doesNotProve: list(c.doesNotProve).map(textValue => text(textValue)), blockedReasons: list(c.blockedReasons).map(textValue => text(textValue,128)) } as unknown as InternalAssuranceProjection['claims'][number]; });
  const evidence = list(row.evidence).map(value => { const e = object(value); exact(e, ['evidenceVersionId','evidenceId','version','evidenceType','referenceType','referenceValue','summary','evidenceBoundary','lifecycle','freshness','observedAt','reviewDueAt','expiresAt','canonicalHash','approved','ownerDisplayName']); return { ...e, evidenceBoundary: oneOf(e.evidenceBoundary, PROOF_BOUNDARIES), lifecycle: oneOf(e.lifecycle, EVIDENCE_LIFECYCLES), freshness: oneOf(e.freshness, EVIDENCE_FRESHNESS) } as InternalAssuranceProjection['evidence'][number]; });
  return { ...row, claims, evidence } as unknown as InternalAssuranceProjection;
};

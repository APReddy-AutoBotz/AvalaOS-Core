import { ASSURANCE_LIFECYCLES, EVIDENCE_FRESHNESS, EVIDENCE_LIFECYCLES, type BuyerSafeProjection, type InternalAssuranceProjection } from './contracts';
import { PROOF_BOUNDARIES, PROOF_STATUSES, READINESS_DOMAINS } from '../trustCenterModel';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) malformed();
  return value as Record<string, unknown>;
};
const malformed = (): never => { throw new Error('MALFORMED_TRUST_ASSURANCE_RESPONSE'); };
const exact = (row: Record<string, unknown>, keys: readonly string[]) => {
  if (Object.keys(row).length !== keys.length || Object.keys(row).some(key => !keys.includes(key))) malformed();
};
const text = (value: unknown, max = 2048): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) malformed();
  return value as string;
};
const uuid = (value: unknown): string => { const result = text(value, 36); if (!UUID.test(result)) malformed(); return result; };
const hash = (value: unknown): string => { const result = text(value, 64); if (!HASH.test(result)) malformed(); return result; };
const iso = (value: unknown): string => { const result = text(value, 64); if (!ISO.test(result) || !Number.isFinite(Date.parse(result))) malformed(); return result; };
const nullableIso = (value: unknown): string | null => value === null ? null : iso(value);
const list = (value: unknown): unknown[] => { if (!Array.isArray(value) || value.length > 500) malformed(); return value as unknown[]; };
const oneOf = <T extends string>(value: unknown, values: readonly T[]): T => { if (typeof value !== 'string' || !values.includes(value as T)) malformed(); return value as T; };
const positiveInteger = (value: unknown): number => { if (!Number.isSafeInteger(value) || (value as number) < 1) malformed(); return value as number; };
const nonnegativeInteger = (value: unknown): number => { if (!Number.isSafeInteger(value) || (value as number) < 0) malformed(); return value as number; };

export const decodeBuyerSafeProjection = (value: unknown): BuyerSafeProjection => {
  const row = object(value); exact(row, ['mode', 'publication', 'claims']);
  if (row.mode !== 'published_snapshot') malformed();
  const publication = object(row.publication); exact(publication, ['publicId', 'snapshotHash', 'publishedAt']);
  return {
    mode: 'published_snapshot',
    publication: { publicId: uuid(publication.publicId), snapshotHash: hash(publication.snapshotHash), publishedAt: iso(publication.publishedAt) },
    claims: list(row.claims).map(value => {
      const claim = object(value); exact(claim, ['wording', 'effectiveProofStatus', 'proofBoundary', 'lastReviewedAt', 'evidence', 'limitationDisclosure', 'doesNotProve']);
      return {
        wording: text(claim.wording, 2000), effectiveProofStatus: oneOf(claim.effectiveProofStatus, PROOF_STATUSES), proofBoundary: oneOf(claim.proofBoundary, PROOF_BOUNDARIES), lastReviewedAt: iso(claim.lastReviewedAt),
        evidence: list(claim.evidence).map(value => { const item = object(value); exact(item, ['summary', 'referenceType', 'referenceValue', 'freshness']); return { summary: text(item.summary, 2000), referenceType: oneOf(item.referenceType, ['repository_path','workflow_run','test_report','attestation','other'] as const), referenceValue: text(item.referenceValue, 512), freshness: oneOf(item.freshness, EVIDENCE_FRESHNESS) }; }),
        limitationDisclosure: text(claim.limitationDisclosure, 4000), doesNotProve: list(claim.doesNotProve).map(value => text(value, 500)),
      };
    }),
  };
};

export type InternalProjectionScope = { organizationId: string; workspaceId: string; authorizationVersion: number };
export const decodeInternalProjection = (value: unknown, expected: InternalProjectionScope): InternalAssuranceProjection => {
  const row = object(value); exact(row, ['mode', 'organizationId', 'workspaceId', 'authorizationVersion', 'readOnly', 'claims', 'evidence', 'relationships', 'reviewQueueCount', 'snapshotHistory', 'currentPublication']);
  const organizationId=uuid(row.organizationId),workspaceId=uuid(row.workspaceId),authorizationVersion=positiveInteger(row.authorizationVersion);
  if (row.mode !== 'server_authoritative' || typeof row.readOnly !== 'boolean' || organizationId !== expected.organizationId || workspaceId !== expected.workspaceId || authorizationVersion !== expected.authorizationVersion) malformed();
  const readOnly=row.readOnly as boolean;
  const claims = list(row.claims).map(value => { const c=object(value);exact(c,['claimVersionId','claimId','version','readinessDomain','claimText','buyerSafeWording','proposedProofStatus','effectiveProofStatus','proofBoundary','limitationDisclosure','doesNotProve','canonicalHash','ownerDisplayName','lifecycle','blockedReasons']);return {claimVersionId:uuid(c.claimVersionId),claimId:uuid(c.claimId),version:positiveInteger(c.version),readinessDomain:oneOf(c.readinessDomain,READINESS_DOMAINS),claimText:text(c.claimText,4000),buyerSafeWording:text(c.buyerSafeWording,2000),proposedProofStatus:oneOf(c.proposedProofStatus,PROOF_STATUSES),effectiveProofStatus:oneOf(c.effectiveProofStatus,PROOF_STATUSES),proofBoundary:oneOf(c.proofBoundary,PROOF_BOUNDARIES),limitationDisclosure:typeof c.limitationDisclosure==='string'&&c.limitationDisclosure.length<=4000?c.limitationDisclosure:malformed(),doesNotProve:list(c.doesNotProve).map(item=>text(item,500)),canonicalHash:hash(c.canonicalHash),ownerDisplayName:text(c.ownerDisplayName,200),lifecycle:oneOf(c.lifecycle,ASSURANCE_LIFECYCLES),blockedReasons:list(c.blockedReasons).map(item=>text(item,128))}; });
  const evidence = list(row.evidence).map(value => { const e=object(value);exact(e,['evidenceVersionId','evidenceId','version','evidenceType','referenceType','referenceValue','summary','evidenceBoundary','lifecycle','freshness','observedAt','reviewDueAt','expiresAt','canonicalHash','approved','ownerDisplayName']);if(typeof e.approved!=='boolean')malformed();const approved=e.approved as boolean;return {evidenceVersionId:uuid(e.evidenceVersionId),evidenceId:uuid(e.evidenceId),version:positiveInteger(e.version),evidenceType:text(e.evidenceType,80),referenceType:oneOf(e.referenceType,['repository_path','workflow_run','test_report','attestation','other'] as const),referenceValue:text(e.referenceValue,512),summary:text(e.summary,2000),evidenceBoundary:oneOf(e.evidenceBoundary,PROOF_BOUNDARIES),lifecycle:oneOf(e.lifecycle,EVIDENCE_LIFECYCLES),freshness:oneOf(e.freshness,EVIDENCE_FRESHNESS),observedAt:nullableIso(e.observedAt),reviewDueAt:nullableIso(e.reviewDueAt),expiresAt:nullableIso(e.expiresAt),canonicalHash:hash(e.canonicalHash),approved,ownerDisplayName:text(e.ownerDisplayName,200)}; });
  const relationships=list(row.relationships).map(value=>{const relation=object(value);exact(relation,['claimVersionId','evidenceVersionId','relationship','rationale']);return{claimVersionId:uuid(relation.claimVersionId),evidenceVersionId:uuid(relation.evidenceVersionId),relationship:oneOf(relation.relationship,['supports','contradicts','limits'] as const),rationale:text(relation.rationale,2000)}});
  const snapshotHistory=list(row.snapshotHistory).map(value=>{const snapshot=object(value);exact(snapshot,['snapshotId','snapshotHash','version','lifecycle','createdAt']);return{snapshotId:uuid(snapshot.snapshotId),snapshotHash:hash(snapshot.snapshotHash),version:positiveInteger(snapshot.version),lifecycle:oneOf(snapshot.lifecycle,ASSURANCE_LIFECYCLES),createdAt:iso(snapshot.createdAt)}});
  let currentPublication:InternalAssuranceProjection['currentPublication']=null;
  if(row.currentPublication!==null){const publication=object(row.currentPublication);exact(publication,['publicationId','snapshotId','snapshotHash','publishedAt']);currentPublication={publicationId:uuid(publication.publicationId),snapshotId:uuid(publication.snapshotId),snapshotHash:hash(publication.snapshotHash),publishedAt:iso(publication.publishedAt)};}
  return {mode:'server_authoritative',organizationId,workspaceId,authorizationVersion,readOnly,claims,evidence,relationships,reviewQueueCount:nonnegativeInteger(row.reviewQueueCount),snapshotHistory,currentPublication};
};

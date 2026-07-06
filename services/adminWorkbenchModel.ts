export type AdminSectionKey =
  | 'overview'
  | 'organization'
  | 'modules'
  | 'trust_center'
  | 'buyer_acceptance_pack'
  | 'buyer_acceptance_review_gate'
  | 'buyer_acceptance_admin_walkthrough'
  | 'evidence_policy'
  | 'users_roles'
  | 'audit_security'
  | 'ai_controls';

export interface AdminSectionDefinition {
  key: AdminSectionKey;
  label: string;
  shortLabel: string;
  description: string;
  proofSafeDisclosure?: string;
}

export const ADMIN_WORKBENCH_SECTIONS: readonly AdminSectionDefinition[] = [
  {
    key: 'overview',
    label: 'Overview',
    shortLabel: 'Overview',
    description: 'Review organization context, module access, proof posture, evidence/approval/audit/export/artifact storage/RLS preparation contract summaries, and next admin decisions.',
    proofSafeDisclosure: 'Trust Center proof states are evidence-gated and do not expand runtime or deployment scope.',
  },
  {
    key: 'organization',
    label: 'Organization',
    shortLabel: 'Org',
    description: 'Maintain company profile context and starter-pack guidance for governed discovery.',
  },
  {
    key: 'modules',
    label: 'Modules',
    shortLabel: 'Modules',
    description: 'Configure enabled product modules while preserving the existing module-save behavior.',
  },
  {
    key: 'trust_center',
    label: 'Trust Center',
    shortLabel: 'Trust',
    description: 'Inspect read-only claim controls, proof states, evidence references, and limitation disclosures.',
    proofSafeDisclosure: 'Trust Center proof states are evidence-gated and do not imply unsupported readiness claims.',
  },
  {
    key: 'buyer_acceptance_pack',
    label: 'Buyer Acceptance Pack',
    shortLabel: 'Buyer Pack',
    description: 'Review the read-only buyer acceptance pack foundation without treating it as readiness approval.',
    proofSafeDisclosure: 'Buyer Acceptance Pack is read-only; it is not an approval, not an export, not a readiness artifact, not a compliance artifact, and no PDF/download generated.',
  },
  {
    key: 'buyer_acceptance_review_gate',
    label: 'Review Rehearsal Gate',
    shortLabel: 'Review Gate',
    description: 'Buyer and AP review rehearsal surface for blockers, questions, safe answers, and export-gating review.',
    proofSafeDisclosure: 'Review Rehearsal Gate is read-only; it is not an approval, not an export, not readiness evidence, not compliance evidence, and no PDF/download generated.',
  },
  {
    key: 'buyer_acceptance_admin_walkthrough',
    label: 'Admin Walkthrough',
    shortLabel: 'Walkthrough',
    description: 'Internal rehearsal view for the read-only buyer-review journey, walkthrough steps, expected observations, blockers, findings, and deferred proof tracks.',
    proofSafeDisclosure: 'Admin Walkthrough is read-only internal rehearsal only; it is not browser automation, not screenshot evidence, not an approval, not an export, not readiness evidence, not compliance evidence, and no PDF/download generated.',
  },
  {
    key: 'evidence_policy',
    label: 'Evidence Policy',
    shortLabel: 'Evidence',
    description: 'Tune assessment evidence policy, reviewer checkpoints, and capture taxonomy.',
  },
  {
    key: 'users_roles',
    label: 'Users / Roles',
    shortLabel: 'Users',
    description: 'Review current organization members and role labels without adding role-management behavior.',
  },
  {
    key: 'audit_security',
    label: 'Audit / Security',
    shortLabel: 'Audit',
    description: 'Review recent audit signals and current security-direction boundaries without changing enforcement.',
  },
  {
    key: 'ai_controls',
    label: 'AI Controls',
    shortLabel: 'AI',
    description: 'Review documented server-side AI and BYOK direction without adding provider behavior.',
    proofSafeDisclosure: 'Server-side AI and BYOK direction is documented; this does not prove security posture or hosted control enforcement.',
  },
] as const;

const adminSectionKeys = new Set<AdminSectionKey>(ADMIN_WORKBENCH_SECTIONS.map(section => section.key));

export function isAdminSectionKey(value: string): value is AdminSectionKey {
  return adminSectionKeys.has(value as AdminSectionKey);
}

export function getDefaultAdminSection(): AdminSectionDefinition {
  return ADMIN_WORKBENCH_SECTIONS[0];
}

export function getAdminSectionByKey(key: string): AdminSectionDefinition | undefined {
  return isAdminSectionKey(key)
    ? ADMIN_WORKBENCH_SECTIONS.find(section => section.key === key)
    : undefined;
}

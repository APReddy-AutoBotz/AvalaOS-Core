export const ASSESS_V2_CAPABILITIES = Object.freeze({
  read: 'assess.v2.read',
  create: 'assess.v2.create',
  clone: 'assess.v2.clone',
  draftWrite: 'assess.v2.draft.write',
  finalize: 'assess.v2.finalize',
  review: 'assess.v2.review',
  evidenceAttest: 'assess.v2.evidence.attest',
  approve: 'assess.v2.approve',
  governResolve: 'assess.v2.govern.resolve',
  studioHandoff: 'assess.v2.studio.handoff',
} as const);

export type AssessV2Capability = typeof ASSESS_V2_CAPABILITIES[keyof typeof ASSESS_V2_CAPABILITIES];

export const ASSESS_V2_COMMAND_CAPABILITY = Object.freeze({
  'assessment_v2.create': ASSESS_V2_CAPABILITIES.create,
  'assessment_v2.clone_from_v1': ASSESS_V2_CAPABILITIES.clone,
  'assessment_v2.draft.upsert': ASSESS_V2_CAPABILITIES.draftWrite,
  'assessment_v2.finalize': ASSESS_V2_CAPABILITIES.finalize,
  'assessment_v2.review.assign': ASSESS_V2_CAPABILITIES.review,
  'assessment_v2.evidence.attest': ASSESS_V2_CAPABILITIES.evidenceAttest,
  'assessment_v2.review.resolve': ASSESS_V2_CAPABILITIES.approve,
  'assessment_v2.revision.start': ASSESS_V2_CAPABILITIES.draftWrite,
  'assessment_v2.govern.resolve': ASSESS_V2_CAPABILITIES.governResolve,
  'assessment_v2.studio.handoff': ASSESS_V2_CAPABILITIES.studioHandoff,
} as const);

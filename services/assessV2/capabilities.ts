export const ASSESS_V2_CAPABILITIES = Object.freeze({
  read: 'assess.v2.read',
  create: 'assess.v2.create',
  clone: 'assess.v2.clone',
  draftWrite: 'assess.v2.draft.write',
  finalize: 'assess.v2.finalize',
} as const);

export type AssessV2Capability = typeof ASSESS_V2_CAPABILITIES[keyof typeof ASSESS_V2_CAPABILITIES];

export const ASSESS_V2_COMMAND_CAPABILITY = Object.freeze({
  'assessment_v2.create': ASSESS_V2_CAPABILITIES.create,
  'assessment_v2.clone_from_v1': ASSESS_V2_CAPABILITIES.clone,
  'assessment_v2.draft.upsert': ASSESS_V2_CAPABILITIES.draftWrite,
  'assessment_v2.finalize': ASSESS_V2_CAPABILITIES.finalize,
} as const);

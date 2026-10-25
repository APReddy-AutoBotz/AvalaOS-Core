import { strict as assert } from 'node:assert';
import type { StudioHandoffSummary, StudioWorkspaceProjection } from '../../services/studioArtifacts/workspaceModel.ts';
import {
  canUseStudioHandoffProjection,
  resolveCurrentStudioHandoff,
  studioHandoffAuthorityIdentity,
  studioHandoffCommandIsCurrent,
  studioHandoffLoadIsCurrent,
  studioHandoffProjectionMatchesContext,
  type StudioHandoffReadiness,
} from './studioHandoffReadiness.ts';

const U = (digit: number) => `0000000${digit}-0000-4000-8000-00000000000${digit}`;
const handoff = (overrides: Partial<StudioHandoffSummary> = {}): StudioHandoffSummary => ({
  kind: 'persisted', handoffId: U(1), handoffVersionId: U(2), upstreamHandoffId: U(3), version: 2,
  direction: 'inbox', state: 'approval_ready', status: 'approval_ready', sourceModule: 'assess', targetModule: 'studio',
  artifactType: 'brd', artifactTypes: ['brd'], sourceVersion: 1, resourceLabel: 'Bound handoff', lineageLabel: 'assessed',
  planningOnly: false, hasStudioTranscriptBundle: false, requestorLabel: 'Requester', targetWorkspaceLabel: 'Workspace',
  requestedAt: null, updatedAt: null, handedOffAt: null, expiresAt: null,
  actions: ['studio.handoff.approval.resolve'], ...overrides,
});
const projection = (item = handoff(), overrides: Partial<StudioWorkspaceProjection> = {}): StudioWorkspaceProjection => ({
  schemaVersion: 'studio-workspace-projection-1', organizationId: U(4), workspaceId: U(5), mode: 'accepted_assess_handoff',
  sourcePackageId: null, sourcePackageVersionId: null, sourcePackageVersion: null, sourcePackageHash: null,
  inputBundleVersionId: null, inputBundleVersion: null, selectedSources: [], sourceAuthority: {
    enabled: true, disabledReason: null, sourceVersions: [], sourceSets: [], inputBundles: [],
  }, totalSelectedSourceCount: 0, sourcePage: 1, sourcePageCount: 1, template: null, lineageLabel: 'assessed',
  planningOnly: false, citations: 0, uncoveredSections: 0, conflicts: 0, blockers: [],
  provider: { available: false, label: 'Disabled', functionalBounds: 'Providers off' }, templates: [],
  inbox: [item], outbox: [], readOnly: false, ...overrides,
});
const context = { organizationId: U(4), workspaceId: U(5), userId: U(6), authorizationVersion: 7 };
const identity = studioHandoffAuthorityIdentity(context);
const ready = (value: StudioWorkspaceProjection = projection()): StudioHandoffReadiness => ({
  identity, requestSequence: 9, phase: 'ready', projection: value,
});

assert.equal(studioHandoffProjectionMatchesContext(projection(), context), true);
assert.equal(canUseStudioHandoffProjection({ readiness: ready(), currentIdentity: identity, context, offline: false, mutationPending: false }), true);
for (const blocked of [
  { readiness: { ...ready(), phase: 'loading' as const } },
  { readiness: { ...ready(), phase: 'committing' as const } },
  { readiness: { ...ready(), phase: 'reload_failed' as const } },
  { readiness: { ...ready(), phase: 'blocked' as const } },
  { readiness: { ...ready(), identity: `${identity}:obsolete` } },
  { readiness: ready(projection(handoff(), { readOnly: true })) },
  { readiness: ready(projection(handoff(), { workspaceId: U(7) })) },
]) assert.equal(canUseStudioHandoffProjection({ ...blocked, currentIdentity: identity, context, offline: false, mutationPending: false }), false);
assert.equal(canUseStudioHandoffProjection({ readiness: ready(), currentIdentity: identity, context, offline: true, mutationPending: false }), false);
assert.equal(canUseStudioHandoffProjection({ readiness: ready(), currentIdentity: identity, context, offline: false, mutationPending: true }), false);

const captured = handoff();
assert.equal(resolveCurrentStudioHandoff(projection(), captured, 'final-approve')?.handoffVersionId, captured.handoffVersionId);
for (const stale of [
  handoff({ version: 3 }), handoff({ handoffVersionId: U(8) }), handoff({ state: 'approved' }),
  handoff({ direction: 'outbox' }), handoff({ actions: [] }), handoff({ sourceVersion: 2 }),
]) assert.equal(resolveCurrentStudioHandoff(projection(stale), captured, 'final-approve'), null);
assert.equal(resolveCurrentStudioHandoff(projection(), captured, 'review-approve'), null);

const firstLoad=ready();
const laterLoad={...ready(),requestSequence:10};
assert.equal(studioHandoffLoadIsCurrent(firstLoad,firstLoad,true),true);
assert.equal(studioHandoffLoadIsCurrent(laterLoad,firstLoad,true),false);
assert.equal(studioHandoffLoadIsCurrent(firstLoad,firstLoad,false),false);
const command={identity,loadSequence:9,commandSequence:1};
assert.equal(studioHandoffCommandIsCurrent(firstLoad,command,command,true,true),true);
assert.equal(studioHandoffCommandIsCurrent(laterLoad,command,command,true,true),false);
assert.equal(studioHandoffCommandIsCurrent(firstLoad,{...command},command,true,true),false);
assert.equal(studioHandoffCommandIsCurrent(firstLoad,command,command,false,true),false);
assert.equal(studioHandoffCommandIsCurrent(firstLoad,command,command,true,false),false);

console.log('studio handoff readiness: 27 identity, phase, scope, read-only, offline, pending, monotonic-load and stale-dialog assertions passed');

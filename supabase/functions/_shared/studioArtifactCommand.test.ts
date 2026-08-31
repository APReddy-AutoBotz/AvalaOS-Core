import { parseStudioArtifactEnvelope, requiredStudioCapability, StudioArtifactError } from './studioArtifactCommand.ts';
import { handleStudioArtifactCommand } from './studioArtifactHandler.ts';
import { prBAssertion, studioPrBRuntime } from './studioArtifactPrBTestEvidence.ts';
import { decodeStudioArtifactV2Ancestry } from '../../../services/studioArtifacts/contracts.ts';

const ids = Array.from({ length: 12 }, (_, index) => `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
const author = studioPrBRuntime('studio-author', ['studio.sources.manage', 'studio.artifacts.generate'], {
  sourcePackage: 'studio-package-direct-v1', template: 'system-brd-v3', artifact: 'studio-artifact-new',
});
const reviewer = studioPrBRuntime('handoff-reviewer', ['studio.handoffs.review'], { handoff: 'assess-studio-handoff-v2' });
const base = {
  contractVersion: 'studio-artifact-2', requestId: ids[0], idempotencyKey: 'request-key-001',
  commandType: 'studio.source-package.create', organizationId: ids[1], workspaceId: ids[2],
  authorizationVersion: 3, expectedAggregateVersion: 0, expectedArtifactVersion: null,
  payload: { sourceMode: 'direct_transcript_bundle', artifactType: 'brd', studioInputBundle: { id: ids[3], versionId: ids[4], version: 2 }, manualBrief: null },
};
const rejects = (value: unknown) => {
  try { parseStudioArtifactEnvelope(value); return false; } catch (error) { return error instanceof StudioArtifactError; }
};
const mark = (passed: boolean, testId: string, assertionId: string, fixture: string, runtimeContext = author) =>
  prBAssertion({ passed, testId, assertionId, fixture, runtimeContext });

mark(parseStudioArtifactEnvelope(base).payload.sourceMode === 'direct_transcript_bundle', 'STUDIO-TR-003', 'command.direct-source-mode', 'direct-studio-disjoint-sources');
mark(rejects({ ...base, extra: true }), 'STUDIO-TR-003', 'command.envelope-unknown-key', 'hostile-envelope-extra-key');
mark(rejects({ ...base, payload: { ...base.payload, provider: 'gemini' } }), 'PROVIDER-008', 'command.browser-provider-key-rejected', 'browser-provider-substitution');
mark(rejects({ ...base, payload: { ...base.payload, manualBriefHash: '0'.repeat(64) } }),
  'STUDIO-TR-003', 'command.client-manual-hash-rejected', 'browser-manual-hash-authority');
mark(rejects({ ...base, payload: { ...base.payload, sourceMode: 'assess_handoff' } }), 'STUDIO-TR-003', 'command.source-mode-exclusive-union', 'fabricated-assess-ancestry');
mark(rejects({ ...base, payload: { sourceMode: 'manual_brief', artifactType: 'brd', studioInputBundle: null, manualBrief: 'x'.repeat(20_001) } }), 'STUDIO-TR-003', 'command.manual-brief-bound', 'oversized-manual-brief');

const assessedAncestry = {
  contractVersion: 'studio-artifact-2', organizationId: ids[1], workspaceId: ids[2],
  sourceMode: 'assess_handoff', assessmentLabel: 'assessed', planningLabel: 'governed_assessed',
  sourcePackageId: ids[5], sourcePackageVersion: 2, sourcePackageHash: 'a'.repeat(64),
  sourceSchemaVersion: 'assess-source-package-2', ruleSetVersion: 'assess-rules-4',
  studioInputBundleId: null, studioInputBundleVersionId: null, studioInputBundleVersion: null,
  caseId: ids[3], sourceCaseVersionId: ids[4], sourceCaseVersion: 3, decisionId: ids[6],
  decisionVersion: 'decision-3', reviewResolutionId: ids[7], governResolutionId: ids[8],
  studioHandoffId: ids[9], reviewSchemaVersion: 'review-2', reviewSequence: 2,
};
const directAncestry = {
  ...assessedAncestry,
  sourceMode: 'direct_transcript_bundle', assessmentLabel: 'not_assessed', planningLabel: 'planning_only',
  sourceSchemaVersion: 'transcript-input-bundle-1', ruleSetVersion: 'direct-studio-planning-1',
  studioInputBundleId: ids[3], studioInputBundleVersionId: ids[4], studioInputBundleVersion: 3,
  caseId: null, sourceCaseVersionId: null, sourceCaseVersion: null, decisionId: null,
  decisionVersion: null, reviewResolutionId: null, governResolutionId: null, studioHandoffId: null,
  reviewSchemaVersion: null, reviewSequence: null,
};
const rejectsAncestry = (value: unknown) => {
  try { decodeStudioArtifactV2Ancestry(value); return false; } catch { return true; }
};
mark(decodeStudioArtifactV2Ancestry(assessedAncestry).caseId === ids[3],
  'STUDIO-TR-004', 'command.assessed-ancestry-exact', 'assess-lineage-non-null',
  studioPrBRuntime('studio-author', ['studio.artifacts.generate'], {
    sourcePackage: ids[5], handoff: ids[9], sourceMode: 'assess_handoff', assessmentLabel: 'assessed',
  }));
mark(decodeStudioArtifactV2Ancestry(directAncestry).caseId === null,
  'STUDIO-TR-003', 'command.not-assessed-ancestry-explicit-null', 'direct-lineage-no-assess-fabrication',
  studioPrBRuntime('studio-author', ['studio.artifacts.generate'], {
    sourcePackage: ids[5], sourceMode: 'direct_transcript_bundle', assessmentLabel: 'not_assessed',
    studioInputBundleId: ids[3], studioInputBundleVersionId: ids[4],
  }));
mark(rejectsAncestry({ ...directAncestry, caseId: ids[3] }),
  'STUDIO-TR-003', 'command.not-assessed-fabricated-assess-rejected', 'fabricated-case-id-lineage',
  studioPrBRuntime('studio-author', ['studio.artifacts.generate'], {
    sourcePackage: ids[5], sourceMode: 'direct_transcript_bundle', assessmentLabel: 'not_assessed',
  }));

const generation = {
  ...base, requestId: ids[4], commandType: 'studio.generation.request', payload: {
    artifactId: ids[3], sourcePackageId: ids[5], sourcePackageVersion: 4,
    template: { kind: 'tenant', templateId: ids[6], versionId: ids[7], version: 3 },
    expectedCurrentVersionId: null, expectedApprovedVersionId: null,
  },
};
mark(parseStudioArtifactEnvelope(generation).payload.sourcePackageVersion === 4, 'STUDIO-TR-004', 'command.exact-source-template-selector', 'hybrid-package-approved-template');
mark(rejects({ ...generation, payload: { ...generation.payload, template: { ...generation.payload.template, version: 0 } } }), 'STUDIO-TR-006', 'command.template-version-positive', 'stale-template-version');
mark(rejects({ ...generation, payload: { ...generation.payload, routeId: ids[8] } }), 'PROVIDER-009-B', 'command.client-route-rejected', 'browser-route-substitution');
mark(rejects({ ...generation, payload: { ...generation.payload, manualBrief: 'client retry material' } }),
  'STUDIO-TR-003', 'command.generation-manual-material-rejected', 'browser-manual-recovery-substitution');

const template = {
  ...base, requestId: ids[8], commandType: 'studio.template.create', payload: {
    name: 'Governed custom requirements', description: 'Synthetic template.', artifactClass: 'custom',
    rendererVersion: 'renderer-2', sections: [{ id: 'scope', title: 'Scope', required: true, fieldKind: 'narrative' }],
  },
};
mark(parseStudioArtifactEnvelope(template).payload.artifactClass === 'custom', 'STUDIO-TR-005', 'command.custom-template-structure', 'approved-custom-template');
mark(rejects({ ...template, payload: { ...template.payload, sections: [...template.payload.sections, template.payload.sections[0]] } }), 'STUDIO-TR-006', 'command.duplicate-section-id', 'malicious-template-duplicate-section');
const templateSubmit = { ...base, requestId: ids[7], commandType: 'studio.template.review.submit', expectedAggregateVersion: 1, expectedArtifactVersion: 1, payload: { templateId: ids[6], templateVersionId: ids[7] } };
mark(parseStudioArtifactEnvelope(templateSubmit).payload.templateVersionId === ids[7]
  && requiredStudioCapability('studio.template.review.submit') === 'studio.templates.manage',
  'STUDIO-TR-005', 'command.template-review-submit-exact-version', 'draft-template-review-submission');
mark(rejects({ ...templateSubmit, payload: { ...templateSubmit.payload, reviewerId: ids[8] } }),
  'STUDIO-TR-006', 'command.template-review-submit-unknown-key', 'template-review-authority-substitution');
mark(requiredStudioCapability('studio.template.approval.resolve') === 'studio.templates.approve', 'STUDIO-TR-010', 'command.approval-capability-specific', 'template-three-person-lifecycle');
mark(requiredStudioCapability('studio.handoff.consume') === 'studio.handoffs.consume', 'HANDOFF-008', 'command.consume-capability-specific', 'accepted-handoff-consumption', reviewer);

const handoffReview = {
  ...base, requestId: ids[9], commandType: 'studio.handoff.review.resolve', expectedAggregateVersion: 2,
  expectedArtifactVersion: 1, payload: { handoffId: ids[10], handoffVersion: 2, outcome: 'changes_requested', rationale: 'Resolve source conflict.', conditions: ['Retain exact bundle.'] },
};
mark(parseStudioArtifactEnvelope(handoffReview).payload.outcome === 'changes_requested', 'HANDOFF-003', 'command.handoff-changes-requested', 'handoff-target-review', reviewer);
mark(rejects({ ...handoffReview, payload: { ...handoffReview.payload, unexpected: true } }), 'HANDOFF-008', 'command.handoff-unknown-key', 'handoff-substitution', reviewer);
const handoffRequest = {
  ...base, commandType: 'studio.handoff.request', payload: { upstreamHandoffId: ids[4], artifactType: 'brd', targetInputBundle: null },
};
mark(rejects({ ...handoffRequest, payload: { ...handoffRequest.payload, routePolicyVersion: 7, routePolicySnapshot: { client: true } } }), 'HANDOFF-002', 'command.client-route-policy-rejected', 'browser-route-policy-substitution', reviewer);

const legacyBase = {
  requestId: ids[0], idempotencyKey: 'legacy-key-001', organizationId: ids[1], workspaceId: ids[2],
  authorizationVersion: 3, expectedAggregateVersion: 1, expectedArtifactVersion: 1,
};
const validLegacyCommands = [
  { ...legacyBase, commandType: 'studio.artifact.generation.request', expectedArtifactVersion: null, payload: { studioHandoffId: ids[3], artifactType: 'brd' } },
  { ...legacyBase, commandType: 'studio.artifact.draft.revise', payload: { artifactId: ids[3], parentVersionId: ids[4], content: { nested: [true, 2, null, { text: 'safe' }] } } },
  { ...legacyBase, commandType: 'studio.artifact.review.submit', payload: { artifactId: ids[3], artifactVersionId: ids[4] } },
  { ...legacyBase, commandType: 'studio.artifact.review.assign', payload: { artifactId: ids[3], artifactVersionId: ids[4], reviewerId: ids[5] } },
  { ...legacyBase, commandType: 'studio.artifact.review.resolve', payload: { artifactId: ids[3], artifactVersionId: ids[4], outcome: 'approve', rationale: 'Reviewed.', conditions: [] } },
  { ...legacyBase, commandType: 'studio.artifact.approval.resolve', payload: { artifactId: ids[3], artifactVersionId: ids[4], outcome: 'reject', rationale: 'Rejected.', conditions: ['Synthetic condition.'] } },
] as const;
const validGovernedCommands = [
  { ...base, requestId: ids[3], payload: { sourceMode: 'manual_brief', artifactType: 'brd', studioInputBundle: null, manualBrief: 'Synthetic planning brief.' } },
  { ...handoffRequest, requestId: ids[4], payload: { ...handoffRequest.payload, targetInputBundle: { id: ids[3], versionId: ids[4], version: 1 } } },
  { ...base, requestId: ids[5], commandType: 'studio.handoff.approval.resolve', expectedAggregateVersion: 2, expectedArtifactVersion: 2, payload: { handoffId: ids[6], handoffVersion: 2, outcome: 'approve', rationale: 'Approved.', conditions: [] } },
  { ...base, requestId: ids[6], commandType: 'studio.handoff.withdraw', expectedAggregateVersion: 2, expectedArtifactVersion: 2, payload: { handoffId: ids[6], handoffVersion: 2, rationale: 'Withdrawn.' } },
  { ...base, requestId: ids[7], commandType: 'studio.handoff.consume', expectedAggregateVersion: 2, expectedArtifactVersion: 2, payload: { handoffId: ids[6], handoffVersion: 2 } },
  { ...base, requestId: ids[8], commandType: 'studio.template.revise', expectedAggregateVersion: 2, expectedArtifactVersion: 2, payload: { templateId: ids[6], parentVersionId: ids[7], name: 'Revised', description: 'Synthetic.', rendererVersion: 'renderer-2', sections: [{ id: 'controls', title: 'Controls', required: false, fieldKind: 'controls' }] } },
  { ...base, requestId: ids[9], commandType: 'studio.template.review.resolve', expectedAggregateVersion: 2, expectedArtifactVersion: 2, payload: { templateId: ids[6], templateVersionId: ids[7], outcome: 'changes_requested', rationale: 'Revise.', conditions: ['Retain scope.'] } },
  { ...base, requestId: ids[10], commandType: 'studio.template.approval.resolve', expectedAggregateVersion: 2, expectedArtifactVersion: 2, payload: { templateId: ids[6], templateVersionId: ids[7], outcome: 'reject', rationale: 'Rejected.', conditions: [] } },
  { ...base, requestId: ids[1], commandType: 'studio.template.deprecate', expectedAggregateVersion: 2, expectedArtifactVersion: 2, payload: { templateId: ids[6], templateVersionId: ids[7], rationale: 'Deprecated.' } },
  { ...base, requestId: ids[2], commandType: 'studio.template.replace', expectedAggregateVersion: 2, expectedArtifactVersion: 2, payload: { templateId: ids[6], templateVersionId: ids[7], replacementTemplateId: ids[8], replacementTemplateVersionId: ids[9], rationale: 'Replaced.' } },
  { ...generation, requestId: ids[3], payload: { ...generation.payload, template: { kind: 'system', versionId: ids[7], version: 'system-brd-v3' }, expectedCurrentVersionId: ids[8], expectedApprovedVersionId: ids[9] } },
] as const;
let validCommandCount = 0;
for (const candidate of [...validLegacyCommands, ...validGovernedCommands]) {
  if (parseStudioArtifactEnvelope(candidate).commandType === candidate.commandType) validCommandCount += 1;
}
mark(validCommandCount === validLegacyCommands.length + validGovernedCommands.length,
  'STUDIO-TR-005', 'command.all-legacy-and-governed-payload-branches-parse',
  'complete-command-payload-matrix');

const deeplyNested = Array.from({ length: 14 }).reduce<unknown>(value => ({ nested: value }), 'leaf');
const invalidCommandMatrix: unknown[] = [
  { ...legacyBase, commandType: 'studio.unknown', payload: {} },
  { ...legacyBase, commandType: 42, payload: {} },
  { ...validLegacyCommands[0], contractVersion: 'studio-artifact-2' },
  { ...base, contractVersion: 'studio-artifact-1' },
  { ...base, idempotencyKey: 'bad key!' },
  { ...base, authorizationVersion: 0 }, { ...base, expectedAggregateVersion: -1 },
  { ...validLegacyCommands[1], payload: { ...validLegacyCommands[1].payload, content: deeplyNested } },
  { ...validLegacyCommands[1], payload: { ...validLegacyCommands[1].payload, content: { bad: Number.POSITIVE_INFINITY } } },
  { ...validLegacyCommands[4], payload: { ...validLegacyCommands[4].payload, outcome: 'unknown' } },
  { ...validLegacyCommands[4], payload: { ...validLegacyCommands[4].payload, conditions: Array(21).fill('x') } },
  { ...template, payload: { ...template.payload, artifactClass: 'unknown' } },
  { ...template, payload: { ...template.payload, sections: [] } },
  { ...template, payload: { ...template.payload, sections: Array.from({ length: 51 }, (_, index) => ({ id: `section-${index}`, title: 'S', required: true, fieldKind: 'narrative' })) } },
  { ...template, payload: { ...template.payload, sections: [{ id: 'scope', title: 'Scope', required: 'yes', fieldKind: 'narrative' }] } },
  { ...template, payload: { ...template.payload, sections: [{ id: 'scope', title: 'Scope', required: true, fieldKind: 'unknown' }] } },
  { ...validGovernedCommands[9], payload: { ...validGovernedCommands[9].payload, replacementTemplateId: ids[6] } },
  { ...generation, payload: { ...generation.payload, template: { kind: 'unknown' } } },
  { ...generation, expectedArtifactVersion: 1 },
  { ...validGovernedCommands[5], expectedArtifactVersion: null },
];
mark(invalidCommandMatrix.every(rejects), 'STUDIO-TR-006',
  'command.invalid-branch-matrix-fails-closed', 'malformed-command-payload-matrix');

const requestFor = (body: unknown = generation) => new Request('https://local/studio', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const committed = { outcome: 'committed' as const, resource: { artifactId: ids[5] }, resourceId: ids[5], receiptId: ids[0] };

void (async () => {
  let effects = 0; let authorityLoads = 0;
  const deps = {
    authenticate: async () => ({ id: ids[11] }),
    loadFreshAuthority: async () => { authorityLoads += 1; return { actorId: ids[11], authorizationVersion: 3, capabilities: ['studio.artifacts.generate'] }; },
    executeAtomicCommand: async () => { effects += 1; return committed; },
  };
  const ok = await handleStudioArtifactCommand(requestFor(), deps);
  mark(ok.status === 201 && effects === 1 && authorityLoads === 2, 'IDEMP-001', 'handler-authority-before-effect-and-disclosure', 'new-generation-receipt');

  const methodDenied = await handleStudioArtifactCommand(new Request('https://local/studio', { method: 'GET' }), deps);
  const authDenied = await handleStudioArtifactCommand(requestFor(), {
    ...deps, authenticate: async () => { throw new Error('synthetic auth failure'); },
  });
  const malformedJson = await handleStudioArtifactCommand(new Request('https://local/studio', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{',
  }), deps);
  const actorMismatch = await handleStudioArtifactCommand(requestFor(), {
    ...deps, loadFreshAuthority: async () => ({ actorId: ids[10], authorizationVersion: 3, capabilities: ['studio.artifacts.generate'] }),
  });
  const capabilityDenied = await handleStudioArtifactCommand(requestFor(), {
    ...deps, loadFreshAuthority: async () => ({ actorId: ids[11], authorizationVersion: 3, capabilities: ['studio.artifacts.read'] }),
  });
  const transportFailure = await handleStudioArtifactCommand(requestFor(), {
    ...deps, executeAtomicCommand: async () => { throw new Error('private database transport detail'); },
  });
  const precommitBodies = await Promise.all([methodDenied, authDenied, malformedJson, actorMismatch, capabilityDenied, transportFailure]
    .map(response => response.json()));
  mark(methodDenied.status === 405 && authDenied.status === 401 && malformedJson.status === 400
    && actorMismatch.status === 404 && capabilityDenied.status === 403 && transportFailure.status === 503
    && precommitBodies.every(body => body.ok === false && body.outcome === 'failed_before_commit'
      && body.error?.message === 'The command could not be completed.'
      && !JSON.stringify(body).includes('private database')),
  'STUDIO-TR-009', 'handler.precommit-method-auth-json-authority-and-transport-errors-sanitized',
  'handler-precommit-negative-matrix');

  let retainedAuthorityLoads = 0;
  const retainedAfterVersionBump = await handleStudioArtifactCommand(requestFor(), {
    ...deps,
    loadFreshAuthority: async () => (++retainedAuthorityLoads === 1
      ? { actorId: ids[11], authorizationVersion: 3, capabilities: ['studio.artifacts.generate'] }
      : { actorId: ids[11], authorizationVersion: 4, capabilities: ['studio.artifacts.generate'] }),
  });
  const commandInProgress = await handleStudioArtifactCommand(requestFor(), {
    ...deps, executeAtomicCommand: async () => ({ ...committed, outcome: 'command_in_progress' as const }),
  });
  mark(retainedAfterVersionBump.status === 201 && retainedAuthorityLoads === 2
    && commandInProgress.status === 409 && (await commandInProgress.json()).outcome === 'command_in_progress',
  'STUDIO-TR-009', 'handler.current-authority-version-retained-and-command-in-progress',
  'current-authority-and-in-progress-receipt');

  const privateManualMaterial = 'private manual material must not enter the response';
  const safeGeneration = await handleStudioArtifactCommand(requestFor(), {
    ...deps,
    executeAtomicCommand: async () => ({ ...committed, generationClaim: { attemptId: ids[1], manualBrief: privateManualMaterial } }),
    executeClaimedGeneration: async () => ({ state: 'completed' as const, resource: { artifactId: ids[5], state: 'completed' } }),
  });
  mark(safeGeneration.status === 201 && !JSON.stringify(await safeGeneration.json()).includes(privateManualMaterial),
    'STUDIO-TR-009', 'handler.private-generation-plan-not-disclosed', 'manual-generation-safe-response');

  const generationStateCases = [
    { expectedStatus: 503, state: { state: 'uncertain' as const, failureCode: 'GENERATION_UNCERTAIN' }, expectedOutcome: 'generation_uncertain' },
    { expectedStatus: 409, state: { state: 'in_progress' as const }, expectedOutcome: 'command_in_progress' },
    { expectedStatus: 200, state: { state: 'failed' as const, failureCode: 'PROVIDER_REQUEST_FAILED' }, expectedOutcome: 'generation_failed' },
  ];
  let generationStateMatches = 0;
  for (const candidate of generationStateCases) {
    const response = await handleStudioArtifactCommand(requestFor(), {
      ...deps,
      executeAtomicCommand: async () => ({ ...committed, generationClaim: { attemptId: ids[1] } }),
      executeClaimedGeneration: async () => candidate.state,
    });
    const body = await response.json();
    if (response.status === candidate.expectedStatus && body.ok === true
      && body.outcome === candidate.expectedOutcome && body.receiptId === committed.receiptId) generationStateMatches += 1;
  }
  const missingGenerationDependency = await handleStudioArtifactCommand(requestFor(), {
    ...deps, executeAtomicCommand: async () => ({ ...committed, generationClaim: { attemptId: ids[1] } }),
  });
  const missingGenerationBody = await missingGenerationDependency.json();
  mark(generationStateMatches === generationStateCases.length
    && missingGenerationDependency.status === 503 && missingGenerationBody.ok === true
    && missingGenerationBody.outcome === 'generation_uncertain'
    && missingGenerationBody.receiptId === committed.receiptId,
  'STUDIO-TR-009', 'handler.all-generation-terminal-and-dependency-absence-states-truthful',
  'handler-generation-state-matrix');

  let postcommitGenerationCalls = 0; let postcommitCommandCalls = 0;
  const postcommitDeps = {
    ...deps,
    executeAtomicCommand: async () => ({
      ...committed,
      outcome: (++postcommitCommandCalls === 1 ? 'committed' : 'replayed') as 'committed' | 'replayed',
      generationClaim: { attemptId: ids[1] },
    }),
    executeClaimedGeneration: async () => {
      postcommitGenerationCalls += 1;
      throw new Error('synthetic private claim/load dependency failure');
    },
  };
  const postcommitFailure = await handleStudioArtifactCommand(requestFor(), postcommitDeps);
  const postcommitReplay = await handleStudioArtifactCommand(requestFor(), postcommitDeps);
  const postcommitBody = await postcommitFailure.json();
  const postcommitReplayBody = await postcommitReplay.json();
  mark(postcommitFailure.status === 503 && postcommitBody.ok === true
    && postcommitBody.outcome === 'generation_uncertain'
    && postcommitBody.receiptId === committed.receiptId && postcommitBody.resourceId === committed.resourceId
    && postcommitBody.resource?.artifactId === ids[5]
    && !('error' in postcommitBody) && !JSON.stringify(postcommitBody).includes('failed_before_commit')
    && postcommitReplay.status === 200 && postcommitReplayBody.outcome === 'replayed'
    && postcommitReplayBody.receiptId === committed.receiptId
    && postcommitGenerationCalls === 1,
  'STUDIO-TR-009', 'handler.postcommit-generation-throw-retains-receipt-and-replays-zero-effect',
  'committed-generation-dependency-throw', studioPrBRuntime('studio-author', ['studio.artifacts.generate'], {
    artifact: ids[5], receiptId: committed.receiptId, attemptId: ids[1], providerEffects: 0,
    firstOutcome: 'generation_uncertain', replayOutcome: 'replayed',
  }));

  let expiredRpcCalls = 0; let expiredEffects = 0;
  const expiredDeps = {
    authenticate: async () => ({ id: ids[11] }),
    loadFreshAuthority: async () => ({
      actorId: ids[11], authorizationVersion: 3, capabilities: ['studio.handoffs.review'],
    }),
    executeAtomicCommand: async () => {
      expiredRpcCalls += 1;
      throw new StudioArtifactError('HANDOFF_EXPIRED');
    },
  };
  const expiredFirst = await handleStudioArtifactCommand(requestFor(handoffReview), expiredDeps);
  const expiredReplay = await handleStudioArtifactCommand(requestFor(handoffReview), expiredDeps);
  const expiredFirstBody = await expiredFirst.json();
  const expiredReplayBody = await expiredReplay.json();
  mark(expiredFirst.status === 409 && expiredReplay.status === 409 && expiredRpcCalls === 2 && expiredEffects === 0
    && JSON.stringify(expiredFirstBody) === JSON.stringify(expiredReplayBody)
    && expiredFirstBody?.error?.code === 'HANDOFF_EXPIRED'
    && !JSON.stringify(expiredFirstBody).includes('private'),
  'HANDOFF-008', 'handler.handoff-expired-stable-zero-effect-replay', 'expired-handoff-repeated-command',
  studioPrBRuntime('handoff-reviewer', ['studio.handoffs.review'], {
    handoff: ids[10], handoffVersion: 2, safeError: 'HANDOFF_EXPIRED', providerEffects: expiredEffects,
  }));

  effects = 0;
  const crossTenant = await handleStudioArtifactCommand(requestFor(), { ...deps, loadFreshAuthority: async () => null });
  mark(crossTenant.status === 404 && effects === 0, 'AUTH-001', 'api.cross-tenant-nondisclosure', 'foreign-organization-generation', studioPrBRuntime('cross-tenant-user', [], { sourcePackage: 'foreign-package-v1' }, { organizationId: '30000000-0000-4000-8000-000000000003', workspaceId: '30000000-0000-4000-8000-000000000004' }));

  const crossWorkspace = await handleStudioArtifactCommand(requestFor(), { ...deps, loadFreshAuthority: async () => null });
  mark(crossWorkspace.status === 404 && effects === 0, 'AUTH-002', 'api.cross-workspace-no-receipt-effect', 'foreign-workspace-template', studioPrBRuntime('cross-workspace-user', ['studio.artifacts.generate'], { template: 'foreign-template-v1' }, { organizationId: '30000000-0000-4000-8000-000000000001', workspaceId: '30000000-0000-4000-8000-000000000004' }));

  const stale = await handleStudioArtifactCommand(requestFor(), { ...deps, loadFreshAuthority: async () => ({ actorId: ids[11], authorizationVersion: 4, capabilities: ['studio.artifacts.generate'] }) });
  mark(stale.status === 409 && effects === 0, 'AUTH-003', 'api.stale-authority-before-receipt', 'stale-generation-authority', studioPrBRuntime('stale-author', ['studio.artifacts.generate'], { sourcePackage: 'studio-package-direct-v1' }));

  const revoked = await handleStudioArtifactCommand(requestFor(), { ...deps, loadFreshAuthority: async () => ({ actorId: ids[11], authorizationVersion: 3, capabilities: [] }) });
  mark(revoked.status === 403 && effects === 0, 'AUTH-004', 'api.revoked-authority-no-mutation', 'revoked-generation-authority', studioPrBRuntime('revoked-author', [], { sourcePackage: 'studio-package-direct-v1' }));

  let loads = 0;
  const revokedBeforeDisclosure = await handleStudioArtifactCommand(requestFor(), {
    ...deps,
    loadFreshAuthority: async () => (++loads === 1
      ? { actorId: ids[11], authorizationVersion: 3, capabilities: ['studio.artifacts.generate'] }
      : { actorId: ids[11], authorizationVersion: 4, capabilities: [] }),
  });
  mark(revokedBeforeDisclosure.status === 403 && effects === 1, 'AUTH-004', 'api.revoked-before-terminal-disclosure', 'response-loss-revocation', studioPrBRuntime('revoked-after-effect', [], { artifact: 'studio-artifact-new' }));

  let providerEffects = 0;
  const replay = await handleStudioArtifactCommand(requestFor(), {
    ...deps, executeAtomicCommand: async () => ({ ...committed, outcome: 'replayed' as const, generationClaim: { attemptId: ids[1] } }),
    executeClaimedGeneration: async () => { providerEffects += 1; return { state: 'completed' as const, resource: {} }; },
  });
  mark(replay.status === 200 && providerEffects === 0 && !(await replay.clone().json()).generationClaim, 'IDEMP-002-B', 'handler.replay-skips-provider', 'generation-response-loss-replay');

  const changedBinding = await handleStudioArtifactCommand(requestFor(), {
    ...deps, executeAtomicCommand: async () => { throw new StudioArtifactError('IDEMPOTENCY_CONFLICT'); },
  });
  mark(changedBinding.status === 409, 'IDEMP-003', 'handler.changed-binding-conflict', 'same-key-different-template');

  let generationCalls = 0;
  const claimed = await handleStudioArtifactCommand(requestFor(), {
    ...deps, executeAtomicCommand: async () => ({ ...committed, generationClaim: { attemptId: ids[1] } }),
    executeClaimedGeneration: async () => { generationCalls += 1; return { state: 'stale' as const, resource: { state: 'stale' } }; },
  });
  mark(claimed.status === 409 && generationCalls === 1 && (await claimed.json()).outcome === 'generation_stale', 'STUDIO-TR-009', 'handler.late-generation-stale', 'concurrent-approved-head');

  console.log('studio artifact PR B command tests completed');
})().catch(error => { console.error(error); throw error; });

import { StudioArtifactError, type StudioArtifactAtomicCommand } from './studioArtifactCommand.ts';
import {
  STUDIO_RPC,
  cancelStudioGeneration,
  claimStudioGeneration,
  decodeStudioTemplateProjection,
  decodeStudioRpcError,
  executeStudioAtomicCommand,
  executeStudioGenerationDependency,
  failStudioGeneration,
  finalizeStudioGeneration,
  loadStudioGenerationMaterial,
  stageStudioGeneration,
  timeoutStudioGeneration,
} from './studioArtifactDb.ts';
import { validateStudioDraft } from './studioArtifactGeneration.ts';
import { prBAssertion, studioPrBRuntime } from './studioArtifactPrBTestEvidence.ts';

const ids = Array.from({ length: 24 }, (_, index) => `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
const sha256 = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
  .map(byte => byte.toString(16).padStart(2, '0')).join('');
const mark = (passed: boolean, testId: string, assertionId: string, fixture: string, lineage: Record<string, string | number | boolean | null> = {}) => prBAssertion({
  passed, testId, assertionId, fixture,
  runtimeContext: studioPrBRuntime('studio-server-adapter', ['studio.artifacts.generate', 'studio.handoffs.consume', 'studio.templates.manage'], {
    sourcePackage: 'studio-package-assess-v1', template: 'system-brd-v3', handoff: 'assess-handoff-v2',
    artifact: 'studio-artifact-v1', provider: 'openai', ...lineage,
  }),
});

const base = {
  actorId: ids[0], contractVersion: 'studio-artifact-2', requestId: ids[1], idempotencyKey: 'server-adapter-key-001',
  organizationId: ids[2], workspaceId: ids[3], authorizationVersion: 4, expectedAggregateVersion: 2,
  expectedArtifactVersion: null,
};

void (async () => {
  for (const [signal, expected] of [
    ['STUDIO_RESOURCE_STALE', 'RESOURCE_STALE'], ['STUDIO_SOURCE_COVERAGE_INCOMPLETE', 'SOURCE_COVERAGE_INCOMPLETE'],
    ['STUDIO_TEMPLATE_NOT_APPROVED', 'TEMPLATE_NOT_APPROVED'], ['STALE_EXECUTION_FENCE', 'RESOURCE_STALE'],
  ] as const) {
    mark(decodeStudioRpcError({ code: signal }).code === expected, 'STUDIO-TR-009', `db.safe-error.${signal.toLowerCase()}`, 'sanitized-rpc-error', { rpcSignal: signal });
  }
  const expired = decodeStudioRpcError({
    code: 'HANDOFF_EXPIRED', message: 'HANDOFF_EXPIRED', details: 'private handoff row must not escape',
  });
  mark(expired.code === 'HANDOFF_EXPIRED' && expired.status === 409,
    'HANDOFF-008', 'db.handoff-expired-exact-safe-error', 'expired-handoff-rpc-signal', {
      handoff: ids[11], rpcSignal: 'HANDOFF_EXPIRED', safeStatus: 409,
    });
  mark(decodeStudioRpcError({ code: '23505', message: 'private table and payload detail' }).code === 'COMMAND_UNAVAILABLE',
    'STUDIO-TR-009', 'db.raw-error-detail-not-disclosed', 'hostile-database-detail', { rpcSignal: 'unknown' });

  const safeProjection = {
    organizationId: ids[2], workspaceId: ids[3], templates: [{
      ownership: 'system', templateId: ids[6], templateVersionId: ids[7], version: 'system-brd-v3',
      name: 'System BRD', description: 'Safe system template.', artifactClass: 'brd', lifecycle: 'approved',
      templateHash: 'a'.repeat(64), rendererVersion: 'renderer-2', contentSchemaVersion: 'studio-structured-document-2',
      sections: [{ id: 'functionalRequirements', title: 'Functional requirements', required: true, fieldKind: 'requirements' }], replacement: null, actions: ['studio.generation.request'],
    }],
  };
  mark(decodeStudioTemplateProjection(safeProjection).templates[0].ownership === 'system',
    'STUDIO-TR-005', 'db.template-projection-exact-safe-shape', 'safe-system-template-projection', { templateVersionId: ids[7] });
  let projectionExtraRejected = false;
  try { decodeStudioTemplateProjection({ ...safeProjection, templates: [{ ...safeProjection.templates[0], providerInstructions: 'private' }] }); }
  catch { projectionExtraRejected = true; }
  mark(projectionExtraRejected, 'STUDIO-TR-006', 'db.template-projection-private-field-rejected', 'provider-instruction-leakage', { templateVersionId: ids[7] });

  const tenantProjection = {
    organizationId: ids[2], workspaceId: ids[3], templates: [{
      ownership: 'tenant', templateId: ids[8], templateVersionId: ids[9], version: 3,
      name: 'Tenant BRD', description: '', artifactClass: 'brd', lifecycle: 'deprecated',
      templateHash: 'b'.repeat(64), rendererVersion: 'renderer-2', contentSchemaVersion: 'studio-structured-document-2',
      sections: [
        { id: 'scope', title: 'Scope', required: true, fieldKind: 'narrative' },
        { id: 'risks', title: 'Risks', required: false, fieldKind: 'risks' },
      ],
      replacement: { templateId: ids[10], templateVersionId: ids[11], version: 4 },
      actions: ['studio.template.revise', 'studio.generation.request'],
    }],
  };
  const decodedTenantProjection = decodeStudioTemplateProjection(tenantProjection);
  mark(decodedTenantProjection.templates[0].ownership === 'tenant'
    && decodedTenantProjection.templates[0].replacement?.version === 4
    && decodedTenantProjection.templates[0].sections.length === 2,
  'STUDIO-TR-005', 'db.tenant-template-replacement-projection-exact',
  'safe-tenant-template-replacement-projection', { template: ids[8], templateVersionId: ids[9] });

  const invalidProjectionMatrix: unknown[] = [
    null, { ...tenantProjection, extra: true },
    { ...tenantProjection, organizationId: 'bad' }, { ...tenantProjection, workspaceId: 'bad' },
    { ...tenantProjection, templates: Array(201).fill(tenantProjection.templates[0]) },
    { ...tenantProjection, templates: [{ ...tenantProjection.templates[0], ownership: 'private' }] },
    { ...tenantProjection, templates: [{ ...tenantProjection.templates[0], version: 0 }] },
    { ...tenantProjection, templates: [{ ...tenantProjection.templates[0], templateHash: 'bad' }] },
    { ...tenantProjection, templates: [{ ...tenantProjection.templates[0], artifactClass: 'unknown' }] },
    { ...tenantProjection, templates: [{ ...tenantProjection.templates[0], lifecycle: 'unknown' }] },
    { ...tenantProjection, templates: [{ ...tenantProjection.templates[0], actions: ['studio.generation.request', 'studio.generation.request'] }] },
    { ...tenantProjection, templates: [{ ...tenantProjection.templates[0], actions: ['private.action'] }] },
    { ...tenantProjection, templates: [{ ...tenantProjection.templates[0], description: 'x'.repeat(2_001) }] },
    { ...tenantProjection, templates: [{ ...tenantProjection.templates[0], replacement: { ...tenantProjection.templates[0].replacement, templateId: 'bad' } }] },
    { ...tenantProjection, templates: [{ ...tenantProjection.templates[0], sections: [] }] },
    { ...tenantProjection, templates: [{ ...tenantProjection.templates[0], sections: [{ id: 'scope', title: 'Scope', required: true, fieldKind: 'narrative' }, { id: 'scope', title: 'Duplicate', required: true, fieldKind: 'rules' }] }] },
    { ...tenantProjection, templates: [{ ...tenantProjection.templates[0], sections: [{ id: 'scope', title: 'Scope', required: 'yes', fieldKind: 'narrative' }] }] },
  ];
  let rejectedProjections = 0;
  for (const candidate of invalidProjectionMatrix) {
    try { decodeStudioTemplateProjection(candidate); } catch { rejectedProjections += 1; }
  }
  mark(rejectedProjections === invalidProjectionMatrix.length,
    'STUDIO-TR-006', 'db.template-projection-invalid-branch-matrix-fails-closed',
    'malformed-template-projection-matrix', { rejectedProjections });

  const manualText = 'Synthetic planning brief retained only in private server material.';
  const manualCommand = {
    ...base, requestId: ids[20], idempotencyKey: 'manual-package-key-001', expectedAggregateVersion: 0,
    commandType: 'studio.source-package.create', payload: { sourceMode: 'manual_brief', artifactType: 'brd', studioInputBundle: null, manualBrief: manualText },
  } as StudioArtifactAtomicCommand;
  const sourceCalls: Array<{ name: string; command: Record<string, unknown> }> = [];
  const sourceInvoke = async (name: string, args: Record<string, unknown>) => {
    const command = args.p_command as Record<string, unknown>; sourceCalls.push({ name, command });
    return { outcome: sourceCalls.length === 1 ? 'committed' : 'replayed', receiptId: ids[21], resourceId: command.artifactId, artifactId: command.artifactId, sourcePackageId: command.sourcePackageId, sourceMode: 'manual_brief', planningOnly: true } as never;
  };
  const sourceResult = await executeStudioAtomicCommand(manualCommand, sourceInvoke);
  await executeStudioAtomicCommand({ ...manualCommand, requestId: ids[22] }, sourceInvoke);
  const firstSourceCommand = sourceCalls[0].command; const secondSourceCommand = sourceCalls[1].command;
  const privatePayload = firstSourceCommand.payload as Record<string, unknown>;
  mark(sourceCalls.every(call => call.name === STUDIO_RPC.sourcePackageCommand)
    && firstSourceCommand.idempotencyKey === manualCommand.idempotencyKey
    && privatePayload.manualBrief === manualText && !('manualBriefHash' in privatePayload),
  'STUDIO-TR-003', 'db.manual-source-rpc-server-hashes-raw-material', 'private-manual-source-initialization', { sourcePackage: String(firstSourceCommand.sourcePackageId), receiptId: ids[21], sourceMode: 'manual_brief' });
  mark(firstSourceCommand.artifactId === secondSourceCommand.artifactId
    && firstSourceCommand.sourcePackageId === secondSourceCommand.sourcePackageId,
  'IDEMP-002-B', 'db.source-identities-stable-across-request-id-replay', 'same-actor-key-new-request-id', { sourcePackage: String(firstSourceCommand.sourcePackageId), artifact: String(firstSourceCommand.artifactId), receiptId: ids[21] });
  mark(!JSON.stringify(sourceResult).includes(manualText) && !('payload' in sourceResult.resource),
    'STUDIO-TR-003', 'db.manual-material-absent-from-public-result', 'safe-manual-source-receipt', { sourcePackage: String(firstSourceCommand.sourcePackageId), receiptId: ids[21] });
  let changedSourceBindingRejected = false;
  try {
    await executeStudioAtomicCommand({ ...manualCommand, requestId: ids[23], payload: { ...manualCommand.payload, manualBrief: `${manualText} changed` } }, async () => {
      throw new StudioArtifactError('IDEMPOTENCY_CONFLICT');
    });
  } catch (error) { changedSourceBindingRejected = error instanceof StudioArtifactError && error.code === 'IDEMPOTENCY_CONFLICT'; }
  mark(changedSourceBindingRejected, 'IDEMP-003', 'db.manual-source-changed-binding-conflict', 'same-key-changed-manual-binding', { sourcePackage: String(firstSourceCommand.sourcePackageId), artifact: String(firstSourceCommand.artifactId) });

  let rpcName = ''; let rpcArgs: Record<string, unknown> = {};
  const generationCommand = {
    ...base, commandType: 'studio.generation.request', payload: {
      artifactId: ids[4], sourcePackageId: ids[5], sourcePackageVersion: 3,
      template: { kind: 'system', versionId: ids[6], version: 'system-brd-v3' },
      expectedCurrentVersionId: ids[7], expectedApprovedVersionId: null,
    },
  } as StudioArtifactAtomicCommand;
  const generationResult = await executeStudioAtomicCommand(generationCommand, async (name, args) => {
    rpcName = name; rpcArgs = args;
    return { outcome: 'committed', receiptId: ids[8], resourceId: ids[4], generationPlan: { attemptId: ids[9] } } as never;
  });
  const serverCommand = (rpcArgs.p_command ?? {}) as Record<string, unknown>;
  const exactGenerationKeys = [
    'actorId', 'organizationId', 'workspaceId', 'requestId', 'idempotencyKey', 'authorizationVersion',
    'artifactId', 'sourcePackageId', 'templateKind', 'templateVersionId', 'expectedAggregateVersion',
    'expectedCurrentVersionId', 'expectedApprovedVersionId',
  ].sort();
  mark(rpcName === STUDIO_RPC.generationRequest
    && JSON.stringify(Object.keys(serverCommand).sort()) === JSON.stringify(exactGenerationKeys)
    && !['provider', 'model', 'routeId', 'prompt', 'budget', 'policy', 'payload', 'manualBrief'].some(key => key in serverCommand),
  'PROVIDER-009-B', 'db.generation-request-server-owned-route', 'browser-provider-authority-substitution', { receiptId: ids[8], attemptId: ids[9] });
  mark(!('generationPlan' in generationResult.resource) && !('provider' in generationResult.resource)
    && !('model' in generationResult.resource) && !('manualBrief' in generationResult.resource),
  'STUDIO-TR-009', 'db.generation-plan-absent-from-public-resource', 'safe-generation-receipt-projection', { receiptId: ids[8], attemptId: ids[9] });

  const handoffCommand = {
    ...base, commandType: 'studio.handoff.request', payload: { upstreamHandoffId: ids[10], artifactType: 'brd', targetInputBundle: null },
  } as StudioArtifactAtomicCommand;
  await executeStudioAtomicCommand(handoffCommand, async (name, args) => {
    rpcName = name; rpcArgs = args;
    return { outcome: 'committed', receiptId: ids[1], handoffId: ids[11] } as never;
  });
  const translatedHandoff = ((rpcArgs.p_command as Record<string, unknown>).payload ?? {}) as Record<string, unknown>;
  mark(rpcName === STUDIO_RPC.handoffCommand
    && (rpcArgs.p_command as Record<string, unknown>).commandType === 'handoff.request'
    && !('routePolicyVersion' in translatedHandoff) && !('routePolicySnapshot' in translatedHandoff),
  'HANDOFF-002', 'db.handoff-policy-derived-server-side', 'assess-to-studio-policy-injection', { handoff: ids[11] });

  const malformedResults: Array<{ fixture: string; value: Record<string, unknown> }> = [
    { fixture: 'missing-outcome', value: { receiptId: ids[1], resourceId: ids[11] } },
    { fixture: 'unknown-outcome', value: { outcome: 'failed', receiptId: ids[1], resourceId: ids[11] } },
    { fixture: 'missing-receipt', value: { outcome: 'committed', resourceId: ids[11] } },
    { fixture: 'malformed-receipt', value: { outcome: 'committed', receiptId: 'not-a-uuid', resourceId: ids[11] } },
    { fixture: 'malformed-resource', value: { outcome: 'committed', receiptId: ids[1], resourceId: 'not-a-uuid' } },
  ];
  const rejectedMalformedResults: string[] = [];
  for (const candidate of malformedResults) {
    try { await executeStudioAtomicCommand(handoffCommand, async () => candidate.value as never); }
    catch (error) {
      if (error instanceof StudioArtifactError && error.code === 'COMMAND_UNAVAILABLE') {
        rejectedMalformedResults.push(candidate.fixture);
      }
    }
  }
  mark(JSON.stringify(rejectedMalformedResults) === JSON.stringify(malformedResults.map(item => item.fixture)),
    'STUDIO-TR-009', 'db.command-result-outcome-and-durable-selectors-exact',
    'malformed-command-rpc-results', { handoff: ids[11], rejectedFixtures: rejectedMalformedResults.join(',') });

  const adapterCommands = [
    {
      ...base, commandType: 'studio.template.create', expectedArtifactVersion: null,
      payload: { name: 'Custom', description: 'Synthetic.', artifactClass: 'custom', rendererVersion: 'renderer-2', sections: [{ id: 'scope', title: 'Scope', required: true, fieldKind: 'narrative' }] },
    },
    {
      ...base, commandType: 'studio.template.revise', expectedArtifactVersion: 2,
      payload: { templateId: ids[6], parentVersionId: ids[7], name: 'Revised', description: 'Synthetic.', rendererVersion: 'renderer-3', sections: [{ id: 'rules', title: 'Rules', required: true, fieldKind: 'rules' }] },
    },
    {
      ...base, commandType: 'studio.handoff.request', expectedArtifactVersion: null,
      payload: { upstreamHandoffId: ids[10], artifactType: 'brd', targetInputBundle: { id: ids[15], versionId: ids[16], version: 2 } },
    },
    {
      ...base, commandType: 'studio.handoff.withdraw', expectedArtifactVersion: 2,
      payload: { handoffId: ids[11], handoffVersion: 2, rationale: 'Withdrawn.' },
    },
    {
      ...base, contractVersion: 'studio-artifact-1', commandType: 'studio.artifact.review.submit', expectedArtifactVersion: 2,
      payload: { artifactId: ids[4], artifactVersionId: ids[7] },
    },
    {
      ...base, commandType: 'studio.source-package.create', expectedAggregateVersion: 0, expectedArtifactVersion: null,
      payload: { sourceMode: 'direct_transcript_bundle', artifactType: 'brd', studioInputBundle: { id: ids[15], versionId: ids[16], version: 2 }, manualBrief: null },
    },
  ] as StudioArtifactAtomicCommand[];
  const adapterCalls: Array<{ name: string; command: Record<string, unknown> }> = [];
  for (const [index, command] of adapterCommands.entries()) {
    await executeStudioAtomicCommand(command, async (name, args) => {
      const translated = (args.p_command ?? {}) as Record<string, unknown>;
      adapterCalls.push({ name, command: translated });
      const resourceId = typeof translated.artifactId === 'string' ? translated.artifactId
        : typeof translated.templateId === 'string' ? translated.templateId
          : typeof translated.handoffId === 'string' ? translated.handoffId : ids[4];
      return { outcome: index % 2 === 0 ? 'committed' : 'replayed', receiptId: ids[1], resourceId } as never;
    });
  }
  const createTemplateRpc = adapterCalls[0].command;
  const reviseTemplatePayload = adapterCalls[1].command.payload as Record<string, unknown>;
  const handoffBundlePayload = adapterCalls[2].command.payload as Record<string, unknown>;
  const handoffWithdrawPayload = adapterCalls[3].command.payload as Record<string, unknown>;
  const directSourcePayload = adapterCalls[5].command.payload as Record<string, unknown>;
  mark(adapterCalls.map(call => call.name).join(',') === [
    STUDIO_RPC.templateCommand, STUDIO_RPC.templateCommand, STUDIO_RPC.handoffCommand,
    STUDIO_RPC.handoffCommand, STUDIO_RPC.artifactCommand, STUDIO_RPC.sourcePackageCommand,
  ].join(',')
    && createTemplateRpc.templateId === base.requestId
    && (createTemplateRpc.payload as Record<string, unknown>).contentSchemaVersion === 'studio-structured-document-2'
    && reviseTemplatePayload.artifactClass === 'custom' && reviseTemplatePayload.rendererCompatibilityVersion === 'renderer-3'
    && handoffBundlePayload.targetInputBundleVersionId === ids[16] && handoffBundlePayload.targetInputBundleVersion === 2
    && adapterCalls[3].command.commandType === 'handoff.withdraw' && handoffWithdrawPayload.reason === 'Withdrawn.'
    && adapterCalls[4].command.commandType === 'studio.artifact.review.submit'
    && directSourcePayload.studioInputBundleId === ids[15] && !('manualBrief' in directSourcePayload),
  'STUDIO-TR-009', 'db.all-command-adapter-dispatch-and-translation-branches',
  'studio-command-rpc-adapter-matrix', { adapterCommandCount: adapterCalls.length });

  const stagedResponse = { title: 'sanitized staged draft' };
  await stageStudioGeneration({ attemptId: ids[9], executionToken: ids[12], executionFence: 7, response: stagedResponse }, async (name, args) => {
    rpcName = name; rpcArgs = args; return { outcome: 'staged', state: 'response_staged' } as never;
  });
  mark(rpcName === STUDIO_RPC.generationStage
    && JSON.stringify(rpcArgs) === JSON.stringify({
      p_attempt_id: ids[9], p_execution_token: ids[12], p_execution_fence: 7,
      p_provider_operation_id: null, p_response: stagedResponse,
    }),
    'IDEMP-002-B', 'db.staged-response-exact-rpc-binding', 'provider-response-loss-recovery', { attemptId: ids[9], executionFence: 7 });
  await timeoutStudioGeneration(ids[9], async (name, args) => { rpcName = name; rpcArgs = args; return { outcome: 'committed', state: 'timed_out' } as never; });
  mark(rpcName === STUDIO_RPC.generationTimeout && JSON.stringify(Object.keys(rpcArgs)) === JSON.stringify(['p_attempt_id']),
    'STUDIO-TR-009', 'db.timeout-is-service-owned-deadline', 'server-scheduled-generation-timeout', { attemptId: ids[9], timeoutAuthority: 'server-fixed-10m' });
  await cancelStudioGeneration({ attemptId: ids[9], actorId: ids[0], reason: 'Synthetic user cancellation.' }, async (name, args) => {
    rpcName = name; rpcArgs = args; return { outcome: 'committed', state: 'cancelled' } as never;
  });
  mark(rpcName === STUDIO_RPC.generationCancel
    && JSON.stringify(rpcArgs) === JSON.stringify({
      p_attempt_id: ids[9], p_actor: ids[0], p_reason: 'Synthetic user cancellation.',
    }), 'BUDGET-002', 'db.generation-cancel-exact-fenced-server-adapter',
  'generation-user-cancellation-rpc', { attemptId: ids[9], actorId: ids[0] });

  const plan = {
    organizationId: ids[2], workspaceId: ids[3], actorId: ids[0], artifactId: ids[4],
    sourcePackageId: ids[5], sourcePackageHash: 'package-hash-v1', sourcePackageVersion: 1,
    templateKind: 'system', templateVersionId: ids[6], templateVersion: 'system-brd-v3', templateHash: 'template-hash-v3',
    provider: 'openai', providerRouteId: ids[13], providerConfigId: ids[14], model: 'governed-model', requestId: ids[1],
    anchorManifestHash: '9'.repeat(64), anchorCount: 1,
  };
  const assessPackageHash = 'd'.repeat(64);
  const assessAnchor = { sourceVersionId: ids[15], locator: 'assess:accepted-handoff', anchorHash: assessPackageHash };
  const read = async <T>(path: string): Promise<T> => {
    if (path.startsWith('studio_artifact_source_packages?')) return [{
      id: ids[5], artifact_id: ids[4], org_id: ids[2], workspace_id: ids[3], version: 1,
      source_mode: 'assess_handoff', assess_handoff_id: ids[11], studio_input_bundle_version_id: null,
      manual_brief_hash: null, package_hash: 'package-hash-v1', candidate_manifest: [], candidate_manifest_hash: '0'.repeat(64), candidate_count: 0,
      anchor_manifest: [assessAnchor], anchor_manifest_hash: '9'.repeat(64), anchor_count: 1,
    }] as T;
    if (path.startsWith('assess_v2_studio_handoffs?')) return [{ id: ids[11], source_version_id: ids[15], package: { facts: [] }, package_hash: assessPackageHash }] as T;
    if (path.startsWith('studio_system_template_versions?')) return [{ id: ids[6], template_version: 'system-brd-v3', provider_instructions: { sections: ['scope'] }, template_hash: 'template-hash-v3' }] as T;
    if (path.startsWith('ai_provider_configs?')) return [{ id: ids[14], provider: 'openai', key_ref_id: ids[16], model_allowlist: ['governed-model'], status: 'active' }] as T;
    throw new Error(`unexpected safe projection query: ${path.split('?')[0]}`);
  };
  const material = await loadStudioGenerationMaterial(plan, read);
  mark(material.selectedSourceVersionIds.length === 1 && material.selectedSourceVersionIds[0] === ids[15]
    && !material.selectedSourceVersionIds.includes(ids[11]),
  'STUDIO-TR-004', 'db.assess-citation-binds-source-version-not-handoff', 'assess-handoff-source-selector', { sourceVersionId: ids[15], handoffId: ids[11] });

  const hybridCandidateManifestHash = 'e'.repeat(64);
  const hybridCandidateManifest = [
    { candidateId: ids[20], candidateVersion: 1, candidateProvenanceHash: '1'.repeat(64), anchorHash: 'b'.repeat(64), sourceId: ids[22], sourceVersionId: ids[15], extractionJobId: ids[8], fieldKey: 'scope', locator: 'page:1' },
    { candidateId: ids[21], candidateVersion: 2, candidateProvenanceHash: '2'.repeat(64), anchorHash: 'c'.repeat(64), sourceId: ids[23], sourceVersionId: ids[19], extractionJobId: ids[9], fieldKey: 'risk', locator: 'page:2' },
  ];
  const hybridCandidateRows = [
    { id: ids[20], source_id: ids[22], source_version_id: ids[15], ai_job_id: ids[8], version: 1, provenance_hash: '1'.repeat(64), field_key: 'scope', value: 'Accepted scope.', source_locator: 'page:1', excerpt_hash: 'b'.repeat(64), suggestion_status: 'accepted', reviewed_by: ids[1], reviewed_at: '2026-08-28T00:00:00Z' },
    { id: ids[21], source_id: ids[23], source_version_id: ids[19], ai_job_id: ids[9], version: 2, provenance_hash: '2'.repeat(64), field_key: 'risk', value: 'Accepted risk.', source_locator: 'page:2', excerpt_hash: 'c'.repeat(64), suggestion_status: 'accepted', reviewed_by: ids[2], reviewed_at: '2026-08-28T00:00:01Z' },
  ];
  const hybridPackageRow = {
    id: ids[5], artifact_id: ids[4], org_id: ids[2], workspace_id: ids[3], version: 1,
    source_mode: 'assess_plus_transcript_bundle', assess_handoff_id: ids[11], studio_input_bundle_version_id: ids[17],
    manual_brief_hash: null, package_hash: 'hybrid-package-hash', candidate_manifest: hybridCandidateManifest,
    candidate_manifest_hash: hybridCandidateManifestHash, candidate_count: hybridCandidateManifest.length,
    anchor_manifest: [assessAnchor,
      { sourceVersionId: ids[15], locator: 'page:1', anchorHash: 'b'.repeat(64) },
      { sourceVersionId: ids[19], locator: 'page:2', anchorHash: 'c'.repeat(64) }],
    anchor_manifest_hash: '8'.repeat(64), anchor_count: 3,
  };
  const hybridPlan = { ...plan, sourcePackageHash: 'hybrid-package-hash', candidateManifestHash: hybridCandidateManifestHash, anchorManifestHash: '8'.repeat(64), anchorCount: 3 };
  const hybridRead = async <T>(path: string): Promise<T> => {
    if (path.startsWith('studio_artifact_source_packages?')) return [hybridPackageRow] as T;
    if (path.startsWith('enterprise_module_input_bundle_items?')) return [{ source_set_version_id: ids[18], ordinal: 1 }] as T;
    if (path.startsWith('enterprise_source_set_version_items?')) return [
      { source_version_id: ids[15], ordinal: 1, source_set_version_id: ids[18], semantic_role: 'primary' },
      { source_version_id: ids[19], ordinal: 2, source_set_version_id: ids[18], semantic_role: 'supplement' },
    ] as T;
    if (path.startsWith('enterprise_evidence_candidates?')) return hybridCandidateRows as T;
    return read<T>(path);
  };
  const hybridMaterial = await loadStudioGenerationMaterial(hybridPlan, hybridRead);
  mark(hybridMaterial.selectedSourceVersionIds.length === 2
    && hybridMaterial.selectedSourceVersionIds[0] === ids[15]
    && hybridMaterial.selectedSourceVersionIds[1] === ids[19],
  'STUDIO-TR-004', 'db.hybrid-deduplicates-assess-source-version', 'hybrid-overlapping-source-selector', { assessSourceVersionId: ids[15], supplementalSourceVersionId: ids[19], selectedSourceCount: 2 });

  const candidateIntegrityCases = [
    { package: { ...hybridPackageRow, candidate_manifest: {} }, rows: hybridCandidateRows },
    { package: { ...hybridPackageRow, candidate_count: 1 }, rows: hybridCandidateRows },
    { package: { ...hybridPackageRow, candidate_manifest_hash: 'bad' }, rows: hybridCandidateRows },
    { package: hybridPackageRow, plan: { ...hybridPlan, candidateManifestHash: 'f'.repeat(64) }, rows: hybridCandidateRows },
    { package: { ...hybridPackageRow, candidate_manifest: [{ ...hybridCandidateManifest[0], privateValue: 'forbidden' }, hybridCandidateManifest[1]] }, rows: hybridCandidateRows },
    { package: { ...hybridPackageRow, candidate_manifest: [{ ...hybridCandidateManifest[0], candidateVersion: 0 }, hybridCandidateManifest[1]] }, rows: hybridCandidateRows },
    { package: { ...hybridPackageRow, candidate_manifest: [hybridCandidateManifest[0], { ...hybridCandidateManifest[1], candidateId: ids[20] }] }, rows: hybridCandidateRows },
    { package: { ...hybridPackageRow, anchor_manifest: [{ ...assessAnchor, locator: 'assess:wrong' }, ...hybridPackageRow.anchor_manifest.slice(1)] }, rows: hybridCandidateRows },
    { package: { ...hybridPackageRow, anchor_manifest: [{ ...assessAnchor, anchorHash: 'f'.repeat(64) }, ...hybridPackageRow.anchor_manifest.slice(1)] }, rows: hybridCandidateRows },
    { package: { ...hybridPackageRow, anchor_count: 2 }, rows: hybridCandidateRows },
    { package: hybridPackageRow, plan: { ...hybridPlan, anchorManifestHash: '7'.repeat(64) }, rows: hybridCandidateRows },
    { package: hybridPackageRow, rows: hybridCandidateRows.slice(0, 1) },
    { package: hybridPackageRow, rows: [{ ...hybridCandidateRows[0], suggestion_status: 'edited' }, hybridCandidateRows[1]] },
    { package: hybridPackageRow, rows: [{ ...hybridCandidateRows[0], reviewed_by: null }, hybridCandidateRows[1]] },
    { package: hybridPackageRow, rows: [{ ...hybridCandidateRows[0], ai_job_id: ids[10] }, hybridCandidateRows[1]] },
    { package: hybridPackageRow, rows: [{ ...hybridCandidateRows[0], source_version_id: ids[19] }, hybridCandidateRows[1]] },
  ];
  let candidateIntegrityRejections = 0;
  for (const fixture of candidateIntegrityCases) {
    const integrityRead = async <T>(path: string): Promise<T> => {
      if (path.startsWith('studio_artifact_source_packages?')) return [fixture.package] as T;
      if (path.startsWith('enterprise_evidence_candidates?')) return fixture.rows as T;
      return hybridRead<T>(path);
    };
    try { await loadStudioGenerationMaterial('plan' in fixture ? fixture.plan : hybridPlan, integrityRead); }
    catch (error) { if (error instanceof StudioArtifactError && ['SOURCE_COVERAGE_INCOMPLETE', 'COMMAND_UNAVAILABLE'].includes(error.code)) candidateIntegrityRejections += 1; }
  }
  mark(candidateIntegrityRejections === candidateIntegrityCases.length,
  'STUDIO-TR-008', 'db.exact-accepted-candidate-manifest-integrity-matrix',
  'edited-wrong-job-mutated-or-incomplete-candidate-material', { rejectedCandidates: candidateIntegrityRejections });

  const directCandidateManifestHash = 'f'.repeat(64);
  const directCandidateManifest = [{ ...hybridCandidateManifest[1] }];
  const tenantMaterialPlan = {
    ...plan, sourcePackageHash: 'direct-package-hash', templateKind: 'tenant',
    templateVersionId: ids[7], templateVersion: 3, templateHash: 'tenant-template-hash',
    provider: 'anthropic', endpoint: 'https://ignored.invalid', candidateManifestHash: directCandidateManifestHash,
    anchorManifestHash: '7'.repeat(64), anchorCount: 1,
  };
  const tenantMaterialRead = async <T>(path: string): Promise<T> => {
    if (path.startsWith('studio_artifact_source_packages?')) return [{
      id: ids[5], artifact_id: ids[4], org_id: ids[2], workspace_id: ids[3], version: 1,
      source_mode: 'direct_transcript_bundle', assess_handoff_id: null, studio_input_bundle_version_id: ids[17],
      manual_brief_hash: null, package_hash: 'direct-package-hash', candidate_manifest: directCandidateManifest,
      candidate_manifest_hash: directCandidateManifestHash, candidate_count: 1,
      anchor_manifest: [{ sourceVersionId: ids[19], locator: 'page:2', anchorHash: 'c'.repeat(64) }],
      anchor_manifest_hash: '7'.repeat(64), anchor_count: 1,
    }] as T;
    if (path.startsWith('enterprise_module_input_bundle_items?')) return [{ source_set_version_id: ids[18], ordinal: 1 }] as T;
    if (path.startsWith('enterprise_source_set_version_items?')) return [
      { source_version_id: ids[19], ordinal: 1, source_set_version_id: ids[18], semantic_role: 'primary' },
    ] as T;
    if (path.startsWith('enterprise_evidence_candidates?')) return [hybridCandidateRows[1]] as T;
    if (path.startsWith('studio_tenant_template_versions?')) return [{
      id: ids[7], version: 3, section_definitions: [{ id: 'scope' }], field_schema: { scope: 'string' },
      template_hash: 'tenant-template-hash', status: 'approved',
    }] as T;
    if (path.startsWith('ai_provider_configs?')) return [{
      id: ids[14], provider: 'anthropic', key_ref_id: ids[16], endpoint_url: 'https://provider.invalid',
      deployment_name: 'tenant-deployment', model_allowlist: ['governed-model'], status: 'active',
    }] as T;
    throw new Error(`unexpected tenant material query: ${path.split('?')[0]}`);
  };
  const tenantMaterial = await loadStudioGenerationMaterial(tenantMaterialPlan, tenantMaterialRead);
  mark(tenantMaterial.sourcePackage.sourceMode === 'direct_transcript_bundle'
    && tenantMaterial.selectedSourceVersionIds[0] === ids[19]
    && (tenantMaterial.templatePayload.sectionDefinitions as unknown[]).length === 1
    && tenantMaterial.providerPlan.provider === 'anthropic'
    && tenantMaterial.providerPlan.endpoint === 'https://provider.invalid'
    && tenantMaterial.providerPlan.deployment === 'tenant-deployment',
  'STUDIO-TR-004', 'db.direct-bundle-tenant-template-and-provider-optionals-materialized',
  'direct-source-tenant-template-provider-route', {
    sourcePackage: ids[5], template: ids[7], provider: 'anthropic', sourceVersionId: ids[19],
  });

  const recoveredManualHash = await sha256(manualText);
  const manualPlan = { ...plan, sourcePackageHash: 'manual-package-hash', sourcePackageVersion: 1,
    anchorManifestHash: '6'.repeat(64), anchorCount: 0 };
  let materialRpcName = ''; let materialRpcArgs: Record<string, unknown> = {};
  const manualRead = async <T>(path: string): Promise<T> => {
    if (path.startsWith('studio_artifact_source_packages?')) return [{
      id: ids[5], artifact_id: ids[4], org_id: ids[2], workspace_id: ids[3], version: 1,
      source_mode: 'manual_brief', assess_handoff_id: null, studio_input_bundle_version_id: null,
      manual_brief_hash: recoveredManualHash, package_hash: 'manual-package-hash', candidate_manifest: [],
      candidate_manifest_hash: '0'.repeat(64), candidate_count: 0,
      anchor_manifest: [], anchor_manifest_hash: '6'.repeat(64), anchor_count: 0,
    }] as T;
    return read<T>(path);
  };
  const recoveredManual = await loadStudioGenerationMaterial(manualPlan, manualRead, async (name, args) => {
    materialRpcName = name; materialRpcArgs = args;
    return { sourcePackageId: ids[5], manualBrief: manualText, manualBriefHash: recoveredManualHash } as never;
  });
  mark(recoveredManual.manualBrief === manualText && materialRpcName === STUDIO_RPC.manualBriefMaterial
    && JSON.stringify(Object.keys(materialRpcArgs).sort()) === JSON.stringify(['p_org', 'p_source_package', 'p_workspace']),
  'IDEMP-002-B', 'db.scheduler-recovery-loads-private-manual-material', 'manual-generation-crash-recovery', { sourcePackage: ids[5], materialHash: recoveredManualHash, materialRpc: STUDIO_RPC.manualBriefMaterial });
  let manualHashMismatchRejected = false;
  try {
    await loadStudioGenerationMaterial(manualPlan, manualRead, async () => ({ sourcePackageId: ids[5], manualBrief: `${manualText} changed`, manualBriefHash: recoveredManualHash }) as never);
  } catch (error) { manualHashMismatchRejected = error instanceof StudioArtifactError && error.code === 'RESOURCE_STALE'; }
  mark(manualHashMismatchRejected, 'STUDIO-TR-009', 'db.private-manual-material-hash-mismatch-rejected', 'tampered-manual-recovery-material', { sourcePackage: ids[5], materialHash: recoveredManualHash });

  let mismatchRejected = false;
  try {
    validateStudioDraft({
      contractVersion: 'studio-artifact-2', title: 'Draft', summary: '',
      sections: [{ id: 'scope', title: 'Scope', body: 'Synthetic.', sourceAnchors: [{ sourceVersionId: ids[11], locator: 'page:1', anchorHash: '0'.repeat(64) }], labels: [] }],
      coverage: { selectedSourceVersionIds: [ids[15]], coveredSourceVersionIds: [ids[15]], complete: true },
    }, material.selectedSourceVersionIds, material.sourceAnchors);
  } catch { mismatchRejected = true; }
  mark(mismatchRejected, 'INJECTION-001', 'db.handoff-id-citation-substitution-rejected', 'mismatched-handoff-source-anchor', { sourceVersionId: ids[15], substitutedHandoffId: ids[11] });

  const claim = await claimStudioGeneration({
    ...plan, attemptId: ids[9], receiptId: ids[8], authorizationVersion: 4, expectedAggregateVersion: 2,
    sourcePackageVersion: 1, maximumOutputTokens: 2_000, expectedTemplateVersion: 'system-brd-v3',
  }, async (name, args) => {
    rpcName = name; rpcArgs = args;
    return { attemptId: ids[9], executionToken: ids[12], executionFence: 8, leaseExpiresAt: '2030-01-01T00:00:00Z', providerAllowed: false, reconcileOnly: true } as never;
  }, async () => material);
  mark(rpcName === STUDIO_RPC.generationClaim && claim.reconcileOnly && !claim.providerAllowed && claim.executionFence === 8
    && rpcArgs.p_attempt_id === ids[9] && rpcArgs.p_lease_seconds === 45,
  'IDEMP-002-B', 'db.reconcile-only-claim-skips-new-provider-authority', 'staged-response-refence', { attemptId: ids[9], executionFence: 8, reconcileOnly: true });

  let preProviderExecutions = 0;
  const recordedFailures: Array<{ attemptId: string; executionToken: string; executionFence: number; failureCode: string }> = [];
  const terminalClaimFailure = await executeStudioGenerationDependency({ attemptId: ids[9] }, {
    claim: initial => claimStudioGeneration(initial, async () => ({
      attemptId: ids[9], executionToken: ids[12], executionFence: 9,
    }) as never, async () => { throw new StudioArtifactError('SOURCE_COVERAGE_INCOMPLETE'); }),
    execute: async () => { preProviderExecutions += 1; return { state: 'completed', resource: {} }; },
    fail: async input => { recordedFailures.push(input); },
  });
  const uncertainClaimFailure = await executeStudioGenerationDependency({ attemptId: ids[10] }, {
    claim: async () => { throw new Error('synthetic claim response loss'); },
    execute: async () => { preProviderExecutions += 1; return { state: 'completed', resource: {} }; },
    fail: async input => { recordedFailures.push(input); },
  });
  const uncertainMaterialFailure = await executeStudioGenerationDependency({ attemptId: ids[10] }, {
    claim: initial => claimStudioGeneration(initial, async () => ({
      attemptId: ids[10], executionToken: ids[13], executionFence: 10,
    }) as never, async () => { throw new Error('synthetic private material read failure'); }),
    execute: async () => { preProviderExecutions += 1; return { state: 'completed', resource: {} }; },
    fail: async () => { throw new Error('synthetic fenced failure write loss'); },
  });
  mark(terminalClaimFailure.state === 'failed'
    && terminalClaimFailure.failureCode === 'GENERATION_START_CONFLICT'
    && recordedFailures.length === 1 && recordedFailures[0].attemptId === ids[9]
    && recordedFailures[0].executionToken === ids[12] && recordedFailures[0].executionFence === 9
    && recordedFailures[0].failureCode === 'GENERATION_START_CONFLICT'
    && uncertainClaimFailure.state === 'uncertain'
    && uncertainClaimFailure.failureCode === 'GENERATION_UNCERTAIN'
    && uncertainMaterialFailure.state === 'uncertain'
    && uncertainMaterialFailure.failureCode === 'GENERATION_UNCERTAIN'
    && preProviderExecutions === 0,
  'STUDIO-TR-009', 'db.claim-material-failure-terminal-or-uncertain-before-provider',
  'generation-claim-material-recovery-failure', {
    attemptId: ids[9], uncertainAttemptId: ids[10], providerEffects: preProviderExecutions,
    executionToken: ids[12], executionFence: 9,
    terminalFailure: 'GENERATION_START_CONFLICT', uncertainFailure: 'GENERATION_UNCERTAIN',
  });

  await failStudioGeneration({
    attemptId: ids[9], executionToken: ids[12], executionFence: 9,
    failureCode: 'GENERATION_START_CONFLICT',
  }, async (name, args) => {
    rpcName = name; rpcArgs = args;
    return {
      outcome: 'committed', attemptId: ids[9], state: 'failed',
      failureCode: 'GENERATION_START_CONFLICT', executionFence: 9,
    } as never;
  });
  mark(rpcName === STUDIO_RPC.generationFail
    && JSON.stringify(rpcArgs) === JSON.stringify({
      p_attempt_id: ids[9], p_execution_token: ids[12], p_fence: 9,
      p_failure_code: 'GENERATION_START_CONFLICT',
    })
    && decodeStudioRpcError({ code: 'STALE_EXECUTION_FENCE' }).code === 'RESOURCE_STALE',
  'STUDIO-TR-009', 'db.generation-failure-is-fenced-and-stale-worker-fails-closed',
  'stale-generation-worker-failure-write', {
    attemptId: ids[9], executionToken: ids[12], executionFence: 9,
    failureCode: 'GENERATION_START_CONFLICT', staleSignal: 'STALE_EXECUTION_FENCE',
  });

  const validFailureAck = {
    outcome: 'committed', attemptId: ids[9], state: 'failed',
    failureCode: 'GENERATION_START_CONFLICT', executionFence: 9,
  };
  const invalidFailureAcks: unknown[] = [
    undefined,
    { ...validFailureAck, outcome: 'no_op' },
    { ...validFailureAck, privateDetail: 'must not pass' },
    { ...validFailureAck, attemptId: ids[10] },
    { ...validFailureAck, executionFence: 10 },
    { ...validFailureAck, failureCode: 'PROVIDER_REQUEST_FAILED' },
  ];
  let rejectedFailureAcks = 0;
  for (const ack of invalidFailureAcks) {
    try {
      await failStudioGeneration({
        attemptId: ids[9], executionToken: ids[12], executionFence: 9,
        failureCode: 'GENERATION_START_CONFLICT',
      }, async () => ack as never);
    } catch { rejectedFailureAcks += 1; }
  }
  const invalidFailureCaller = await executeStudioGenerationDependency({ attemptId: ids[9] }, {
    claim: initial => claimStudioGeneration(initial, async () => ({
      attemptId: ids[9], executionToken: ids[12], executionFence: 9,
    }) as never, async () => { throw new Error('synthetic material failure'); }),
    fail: input => failStudioGeneration(input, async () => ({ ...validFailureAck, outcome: 'no_op' }) as never),
  });
  mark(rejectedFailureAcks === invalidFailureAcks.length
    && invalidFailureCaller.state === 'uncertain'
    && invalidFailureCaller.failureCode === 'GENERATION_UNCERTAIN',
  'STUDIO-TR-009', 'db.failure-ack-exact-or-caller-remains-uncertain',
  'malformed-fenced-failure-acknowledgements', {
    attemptId: ids[9], executionToken: ids[12], executionFence: 9,
    rejectedAcknowledgements: rejectedFailureAcks, callerState: 'uncertain', failureWritesProven: false,
  });

  const validFinalizeAck = {
    outcome: 'committed', attemptId: ids[9], state: 'completed',
    artifactId: ids[4], versionId: ids[14], stale: false,
  };
  const finalizedSafe = await finalizeStudioGeneration({
    attemptId: ids[9], executionToken: ids[12], executionFence: 9,
  }, async (name, args) => { rpcName = name; rpcArgs = args; return validFinalizeAck as never; });
  const finalizedRpcName = rpcName;
  const finalizedRpcArgs = rpcArgs;
  const invalidFinalizeAcks: unknown[] = [
    { ...validFinalizeAck, privateDetail: 'must not pass' },
    { ...validFinalizeAck, attemptId: ids[10] },
    { ...validFinalizeAck, outcome: 'no_op' },
    { ...validFinalizeAck, state: 'stale_completed', stale: false },
    { ...validFinalizeAck, versionId: 'not-a-uuid' },
    { outcome: 'committed', attemptId: ids[9], state: 'completed', artifactId: ids[4], stale: false },
  ];
  let rejectedFinalizeAcks = 0;
  for (const ack of invalidFinalizeAcks) {
    try {
      await finalizeStudioGeneration({
        attemptId: ids[9], executionToken: ids[12], executionFence: 9,
      }, async () => ack as never);
    } catch { rejectedFinalizeAcks += 1; }
  }
  mark(finalizedSafe.state === 'completed'
    && JSON.stringify(finalizedSafe.resource) === JSON.stringify(validFinalizeAck)
    && finalizedRpcName === STUDIO_RPC.generationFinalize
    && JSON.stringify(finalizedRpcArgs) === JSON.stringify({
      p_attempt_id: ids[9], p_execution_token: ids[12], p_execution_fence: 9,
    })
    && rejectedFinalizeAcks === invalidFinalizeAcks.length,
  'STUDIO-TR-009', 'db.finalize-ack-exact-safe-projection-or-uncertain',
  'malformed-finalize-acknowledgements', {
    attemptId: ids[9], executionToken: ids[12], executionFence: 9,
    artifact: ids[4], versionId: ids[14], rejectedAcknowledgements: rejectedFinalizeAcks,
  });

  console.log('studio artifact PR B DB adapter tests completed');
})().catch(error => { console.error(error); throw error; });

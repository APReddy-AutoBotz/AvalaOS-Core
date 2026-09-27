import assert from 'node:assert/strict';
import {
  CONTROLLED_HUMAN_CATALOG,
  CONTROLLED_HUMAN_SERVER_ACTIONS,
  canonicalJson,
  sha256Digest,
} from './prCControlledHumanEvidenceContract.mjs';

const digest = value => sha256Digest(Buffer.from(typeof value === 'string' ? value : canonicalJson(value), 'utf8'));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const contractFor = planned => CONTROLLED_HUMAN_SERVER_ACTIONS.find(value => value.checkpointId === planned.checkpointId && value.stepId === planned.stepId);
const PERSONA_BY_STEP = new Map(CONTROLLED_HUMAN_CATALOG.flatMap(checkpoint => checkpoint.steps.map(step => [`${checkpoint.checkpointId}\0${step.stepId}`, step.personaKey])));
const requireId = value => { assert(UUID.test(value ?? ''), 'PR_C_SYNTHETIC_BROWSER_API_SELECTOR_REJECTED'); return value; };
const requireVersion = value => { assert(Number.isSafeInteger(value) && value > 0, 'PR_C_SYNTHETIC_BROWSER_API_VERSION_REJECTED'); return value; };
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys, code = 'PR_C_SYNTHETIC_BROWSER_API_SELECTOR_REJECTED') => {
  assert(record(value) && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0'), code);
  return value;
};
const validatePlanned = planned => {
  const contract = contractFor(planned);
  assert(contract && PERSONA_BY_STEP.get(`${planned.checkpointId}\0${planned.stepId}`) === planned.personaKey,
    'PR_C_SYNTHETIC_BROWSER_API_STEP_REJECTED');
  return contract;
};

// Replay and negative probes deliberately have no enabled ordinary mutation
// control after reload. Use the same authenticated preanchor/receipt protocol;
// all ordinary positive catalog actions continue through the product UI.
export const isSyntheticApiEvidenceStep = planned => {
  const contract = planned && contractFor(planned);
  const personaMatches = contract && PERSONA_BY_STEP.get(`${planned.checkpointId}\0${planned.stepId}`) === planned.personaKey;
  return Boolean(personaMatches && (contract.observationKind === 'negative_attempt' || contract.transitionKind === 'replay_existing'));
};

export const buildSyntheticApiEvidenceDescriptor = (planned, {
  workspaceId, authorizationVersion, replay, deliveryPackage, sourceArtifact,
} = {}) => {
  const contract = validatePlanned(planned);
  assert(isSyntheticApiEvidenceStep(planned), 'PR_C_SYNTHETIC_BROWSER_API_STEP_REJECTED');
  if (contract.transitionKind === 'replay_existing') {
    assert(replay?.body?.commandType === contract.action && DIGEST.test(replay.resourceDigest ?? ''), 'PR_C_SYNTHETIC_BROWSER_API_REPLAY_BINDING_MISSING');
    const payload = replay.body.payload;
    const consume = contract.action === 'delivery.handoff.consume';
    assert.deepEqual(Object.keys(payload ?? {}).sort(), (consume
      ? ['handoffId', 'expectedHandoffVersion']
      : ['workPackageId', 'expectedPackageVersion', 'expectedPackageVersionId']).sort(), 'PR_C_SYNTHETIC_BROWSER_API_REPLAY_SELECTOR_REJECTED');
    if (!consume) requireId(payload.expectedPackageVersionId);
    return { targetFamily: contract.targetFamily, targetId: requireId(consume ? payload.handoffId : payload.workPackageId),
      expectedVersion: requireVersion(consume ? payload.expectedHandoffVersion : payload.expectedPackageVersion),
      selectorBindings: { ...payload }, replay };
  }
  if (contract.targetFamily === 'workspace') {
    const items = [{ clientKey: 'item-0001', itemType: 'Task', title: 'Synthetic denial probe',
      description: 'Synthetic non-production authorization denial probe.',
      acceptanceCriteria: ['The real production authority rejects this request.'], nonFunctionalRequirements: ['No side effect is committed.'] }];
    return { targetFamily: 'workspace', targetId: requireId(workspaceId), expectedVersion: requireVersion(authorizationVersion),
      selectorBindings: contract.action === 'delivery.workspace.projection' ? {} : {
        manualBriefDigest: digest('Synthetic controlled-human denial probe'), orderedItemsDigest: digest(items), itemCount: 1,
      } };
  }
  if (contract.action === 'delivery.package.revision.commit') {
    const targetId = requireId(deliveryPackage?.id);
    const expectedVersion = requireVersion(deliveryPackage.aggregateVersion);
    // The existing server-owned denial primitive uses these exact scoped
    // preconditions and makes the authority stale before attempting the command.
    const precondition = digest([{ item: 'stale-auth-precondition' }]);
    return { targetFamily: 'delivery_work_package', targetId, expectedVersion, selectorBindings: {
      workPackageId: targetId, expectedPackageVersion: requireVersion(deliveryPackage.currentVersion),
      expectedPackageVersionId: requireId(deliveryPackage.currentVersionId), expectedPackageAggregateVersion: expectedVersion,
      expectedItemsDigest: precondition, expectedItemCount: 1, itemRevisionsDigest: precondition, revisionCount: 1,
    } };
  }
  assert(contract.action === 'delivery.handoff.request', 'PR_C_SYNTHETIC_BROWSER_API_STEP_REJECTED');
  assert(sourceArtifact?.currentVersion?.id === sourceArtifact?.currentApprovedVersion?.id && sourceArtifact?.lifecycle === 'approved',
    'PR_C_SYNTHETIC_BROWSER_API_SOURCE_NOT_APPROVED');
  assert(['assess_handoff', 'direct_transcript_bundle', 'assess_plus_transcript_bundle'].includes(sourceArtifact.sourcePackage?.sourceMode),
    'PR_C_SYNTHETIC_BROWSER_API_SOURCE_MODE_REJECTED');
  const targetId = requireId(sourceArtifact.id); const versionId = requireId(sourceArtifact.currentApprovedVersion.id);
  const expectedVersion = requireVersion(sourceArtifact.aggregateVersion);
  return { targetFamily: 'studio_artifact', targetId, expectedVersion, selectorBindings: {
    targetWorkspaceId: requireId(workspaceId), studioArtifactId: targetId, studioArtifactVersionId: versionId,
    expectedAggregateVersion: expectedVersion, expectedCurrentVersionId: versionId, expectedApprovedVersionId: versionId,
  } };
};

const validateDescriptor = (planned, descriptor) => {
  const contract = validatePlanned(planned);
  assert(record(descriptor) && descriptor.targetFamily === contract.targetFamily && UUID.test(descriptor.targetId ?? '')
    && Number.isSafeInteger(descriptor.expectedVersion) && descriptor.expectedVersion > 0 && record(descriptor.selectorBindings),
  'PR_C_SYNTHETIC_BROWSER_API_SELECTOR_REJECTED');
  const selector = descriptor.selectorBindings;
  if (contract.transitionKind === 'replay_existing') {
    exactKeys(descriptor, ['targetFamily', 'targetId', 'expectedVersion', 'selectorBindings', 'replay']);
    assert(record(descriptor.replay) && record(descriptor.replay.body) && descriptor.replay.body.commandType === contract.action
      && DIGEST.test(descriptor.replay.resourceDigest ?? ''), 'PR_C_SYNTHETIC_BROWSER_API_REPLAY_BINDING_MISSING');
    const consume = contract.action === 'delivery.handoff.consume';
    exactKeys(selector, consume ? ['handoffId', 'expectedHandoffVersion'] : ['workPackageId', 'expectedPackageVersion', 'expectedPackageVersionId']);
    assert(descriptor.targetId === (consume ? selector.handoffId : selector.workPackageId)
      && descriptor.expectedVersion === (consume ? selector.expectedHandoffVersion : selector.expectedPackageVersion)
      && canonicalJson(descriptor.replay.body.payload) === canonicalJson(selector)
      && (consume || UUID.test(selector.expectedPackageVersionId ?? '')),
    'PR_C_SYNTHETIC_BROWSER_API_REPLAY_SELECTOR_REJECTED');
  } else {
    exactKeys(descriptor, ['targetFamily', 'targetId', 'expectedVersion', 'selectorBindings']);
    if (contract.selectorSchema === 'negative_projection') exactKeys(selector, []);
    else if (contract.selectorSchema === 'negative_manual') {
      exactKeys(selector, ['manualBriefDigest', 'orderedItemsDigest', 'itemCount']);
      assert(DIGEST.test(selector.manualBriefDigest ?? '') && DIGEST.test(selector.orderedItemsDigest ?? '') && selector.itemCount === 1,
        'PR_C_SYNTHETIC_BROWSER_API_SELECTOR_REJECTED');
    } else if (contract.selectorSchema === 'negative_revision') {
      exactKeys(selector, ['workPackageId', 'expectedPackageVersion', 'expectedPackageVersionId', 'expectedPackageAggregateVersion', 'expectedItemsDigest', 'expectedItemCount', 'itemRevisionsDigest', 'revisionCount']);
      assert(selector.workPackageId === descriptor.targetId && selector.expectedPackageAggregateVersion === descriptor.expectedVersion
        && Number.isSafeInteger(selector.expectedPackageVersion) && selector.expectedPackageVersion > 0 && UUID.test(selector.expectedPackageVersionId ?? '')
        && DIGEST.test(selector.expectedItemsDigest ?? '') && selector.expectedItemCount === 1
        && DIGEST.test(selector.itemRevisionsDigest ?? '') && selector.revisionCount === 1,
      'PR_C_SYNTHETIC_BROWSER_API_SELECTOR_REJECTED');
    } else if (contract.selectorSchema === 'negative_handoff') {
      exactKeys(selector, ['targetWorkspaceId', 'studioArtifactId', 'studioArtifactVersionId', 'expectedAggregateVersion', 'expectedCurrentVersionId', 'expectedApprovedVersionId']);
      assert(selector.studioArtifactId === descriptor.targetId && selector.expectedAggregateVersion === descriptor.expectedVersion
        && [selector.targetWorkspaceId, selector.studioArtifactVersionId, selector.expectedCurrentVersionId, selector.expectedApprovedVersionId].every(value => UUID.test(value ?? ''))
        && selector.studioArtifactVersionId === selector.expectedCurrentVersionId && selector.studioArtifactVersionId === selector.expectedApprovedVersionId,
      'PR_C_SYNTHETIC_BROWSER_API_SELECTOR_REJECTED');
    }
    else assert.fail('PR_C_SYNTHETIC_BROWSER_API_STEP_REJECTED');
  }
  return contract;
};

export const executeSyntheticApiEvidenceAction = async ({ api, planned, descriptor, exerciseDigest, interactionSequence }) => {
  const contract = validateDescriptor(planned, descriptor);
  assert(isSyntheticApiEvidenceStep(planned) && DIGEST.test(exerciseDigest) && Array.isArray(interactionSequence)
    && api && typeof api.rpc === 'function' && typeof api.invoke === 'function', 'PR_C_SYNTHETIC_BROWSER_API_STEP_REJECTED');
  const anchor = await api.rpc('pr_c_controlled_human_anchor_step', {
    p_exercise_digest: exerciseDigest, p_checkpoint_id: planned.checkpointId, p_step_id: planned.stepId,
    p_target_family: descriptor.targetFamily, p_target_id: descriptor.targetId,
    p_expected_version: descriptor.expectedVersion, p_selector_bindings: descriptor.selectorBindings,
  });
  const safe = anchor?.safeAnchor;
  assert(safe?.contractVersion === 'pr-c-controlled-human-step-anchor-1' && safe.stepId === planned.stepId
    && safe.action === contract.action && safe.targetFamily === descriptor.targetFamily && safe.expectedVersion === descriptor.expectedVersion
    && safe.transitionKind === contract.transitionKind
    && safe.targetDigest === digest({ resourceFamily: descriptor.targetFamily, resourceId: descriptor.targetId })
    && safe.selectorDigest === digest(descriptor.selectorBindings) && DIGEST.test(safe.challengeToken)
    && UUID.test(anchor?.execution?.requestId ?? ''), 'PR_C_SYNTHETIC_BROWSER_API_ANCHOR_REJECTED');
  interactionSequence.push(`api:preanchor:${planned.checkpointId.toLowerCase()}:${planned.stepId}`);
  let binding;
  if (contract.observationKind === 'negative_attempt') {
    binding = await api.rpc('pr_c_controlled_human_execute_denied_step', {
      p_exercise_digest: exerciseDigest, p_challenge_token: safe.challengeToken,
    });
    assert(binding?.result === 'denied' && binding.denialCodeDigest === digest({ denialCode: contract.expectedDenialCode }),
      'PR_C_SYNTHETIC_BROWSER_API_DENIAL_REJECTED');
    interactionSequence.push(`api:server-owned-denial:${planned.stepId}`);
  } else {
    assert(typeof anchor.execution.businessIdempotencyKey === 'string' && anchor.execution.businessIdempotencyKey.length > 7,
      'PR_C_SYNTHETIC_BROWSER_API_REPLAY_IDENTITY_MISSING');
    const body = { ...descriptor.replay.body, requestId: anchor.execution.requestId, idempotencyKey: anchor.execution.businessIdempotencyKey };
    const response = await api.invoke('enterprise-intelligence-command', body,
      { checkpointId: planned.checkpointId, stepId: planned.stepId, action: contract.action });
    assert(response?.ok === true, 'PR_C_SYNTHETIC_BROWSER_API_REPLAY_NOT_CONFIRMED');
    binding = await api.rpc('pr_c_controlled_human_complete_step', {
      p_exercise_digest: exerciseDigest, p_challenge_token: safe.challengeToken,
    });
    assert(binding?.result === 'succeeded' && binding.resourceDigest === descriptor.replay.resourceDigest,
      'PR_C_SYNTHETIC_BROWSER_API_REPLAY_RESOURCE_CHANGED');
    interactionSequence.push(`api:replay-exact-receipt:${planned.stepId}`);
  }
  assert(binding?.contractVersion === 'pr-c-controlled-human-step-binding-3' && binding.stepId === planned.stepId
    && binding.action === contract.action && binding.expectedVersion === descriptor.expectedVersion
    && Number.isSafeInteger(binding.observedVersion) && binding.observedVersion >= 0 && binding.anchorToken === safe.challengeToken
    && binding.requestDigest === safe.requestDigest && binding.intentDigest === safe.intentDigest && DIGEST.test(binding.bindingToken),
    'PR_C_SYNTHETIC_BROWSER_API_COMPLETION_REJECTED');
  return { serverAnchor: safe, serverBinding: binding };
};

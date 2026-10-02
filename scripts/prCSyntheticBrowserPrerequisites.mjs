import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const HASH = /^[0-9a-f]{64}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const MAX_COMPLETE_ITEM_COUNT = 250;
const DIRECT_SOURCE_COUNT = 2;
const SYNTHETIC_TEMPLATE_NAME = 'Synthetic controlled-human requirements template';
const DIRECT_GENERATION_ACTION = 'pr_c.controlled_human.synthetic_studio_generate';
const DIRECT_GENERATION_FUNCTION = 'pr-c-controlled-human-synthetic-generation';

export const SYNTHETIC_PREREQUISITE_STATE_KEYS = Object.freeze({
  lastCompletedStep: 'catalog:lastCompletedStep',
  ch03ArtifactId: 'prereq:ch03:artifactId',
  ch04RequestSource: 'prereq:ch04:requestSource',
  ch04ReplacementHandoffId: 'prereq:ch04:replacementHandoffId',
  ch06FinalItemId: 'prereq:ch06:finalItemId',
  ch10ArtifactId: 'prereq:ch10:artifactId',
  ch10CatalogBindingToken: 'prereq:ch10:catalogBindingToken',
  ch10ApprovedCandidate: 'prereq:ch10:approvedCandidate',
  ch10HandoffId: 'prereq:ch10:handoffId',
  ch10PackageId: 'prereq:ch10:packageId',
  ch10BaselineId: 'prereq:ch10:baselineId',
  ch11PackageId: 'prereq:ch11:packageId',
});

const TRIGGERS = Object.freeze({
  'CH-03:approve-hybrid-studio-document': 'CH-03:generate-source-bound-document',
  'CH-04:reject-new-exact-handoff-request': 'CH-04:verify-changes-create-no-target-draft',
  'CH-06:decide-every-current-proposal': 'CH-06:compare-immutable-descendant-history',
  'CH-07:review-complete-revised-package': 'CH-07:decide-revised-descendant',
  'CH-10:handoff-direct-studio-plan': 'CH-10:create-direct-studio-plan',
  'CH-10:approve-direct-planning-package': 'CH-10:handoff-direct-studio-plan',
  'CH-10:verify-direct-plan-remains-not-assessed': 'CH-10:approve-direct-planning-package',
  'CH-11:review-manual-delivery-package': 'CH-11:create-manual-delivery-package',
});

const fail = code => { throw new Error(`PR_C_SYNTHETIC_PREREQUISITE_REJECTED:${code}`); };
const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const id = (value, code) => typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : fail(code);
const positive = (value, code) => Number.isSafeInteger(Number(value)) && Number(value) >= 1 ? Number(value) : fail(code);

const sessionApi = (sessions, persona) => {
  const session = sessions instanceof Map ? sessions.get(persona) : null;
  if (!session?.api || typeof session.api.context !== 'function' || typeof session.api.rpc !== 'function' || typeof session.api.invoke !== 'function') fail(`SESSION_${persona}`);
  return session.api;
};

const apiFrom = sessionOrApi => sessionOrApi?.api ?? sessionOrApi;

const contextFor = async (api, persona) => {
  const context = await api.context();
  if (!isRecord(context)) fail(`CONTEXT_${persona}`);
  return {
    userId: id(context.userId, `CONTEXT_USER_${persona}`),
    organizationId: id(context.organizationId, `CONTEXT_ORG_${persona}`),
    workspaceId: id(context.workspaceId, `CONTEXT_WORKSPACE_${persona}`),
    authorizationVersion: positive(context.authorizationVersion, `CONTEXT_AUTH_${persona}`),
  };
};

const sameScope = (left, right) => {
  if (left.organizationId !== right.organizationId || left.workspaceId !== right.workspaceId) fail('TENANT_SCOPE_MISMATCH');
};

export const resolveSyntheticStudioReviewerId = async sessions => {
  const requester = await contextFor(sessionApi(sessions, 'requester'), 'requester');
  const reviewer = await contextFor(sessionApi(sessions, 'studio_reviewer'), 'studio_reviewer');
  sameScope(requester, reviewer);
  if (requester.userId === reviewer.userId) fail('STUDIO_REVIEWER_NOT_INDEPENDENT');
  return reviewer.userId;
};

const expectation = (checkpointId, stepId, action) => ({ checkpointId, stepId, action });

export const decodeSyntheticCommandSuccess = (result, { action, resourceId = '' } = {}) => {
  if (!isRecord(result) || result.ok !== true || !['committed', 'replayed', 'generation_completed'].includes(result.outcome)
    || !UUID.test(String(result.receiptId ?? '')) || !UUID.test(String(result.resourceId ?? ''))
    || (action && result.action !== undefined && result.action !== action)
    || (resourceId && String(result.resourceId).toLowerCase() !== resourceId)) fail(`COMMAND_RESULT_${action}`);
  return Object.freeze({
    outcome: result.outcome, receiptId: String(result.receiptId).toLowerCase(), resourceId: String(result.resourceId).toLowerCase(),
    ...(Number.isSafeInteger(Number(result.resourceVersion)) ? { resourceVersion: Number(result.resourceVersion) } : {}),
    ...(UUID.test(String(result.workPackageId ?? '')) ? { workPackageId: String(result.workPackageId).toLowerCase() } : {}),
  });
};

export const syntheticCommandResourceId = (response, action) => decodeSyntheticCommandSuccess(response, { action }).resourceId;

const successful = (result, action, resourceId) => {
  decodeSyntheticCommandSuccess(result, { action, resourceId });
  return result;
};

const studioProjection = async (api, context, artifactId) => {
  const projection = await api.rpc('studio_artifact_projection_v2', {
    p_org: context.organizationId,
    p_workspace: context.workspaceId,
    p_artifact: artifactId,
  });
  const value = isRecord(projection?.projection) ? projection.projection : projection;
  if (!isRecord(value) || id(value.id, 'STUDIO_PROJECTION_ID') !== artifactId
    || id(value.currentVersion?.id, 'STUDIO_CURRENT_VERSION') === ''
    || !Number.isSafeInteger(Number(value.currentVersion?.version))
    || positive(value.aggregateVersion, 'STUDIO_AGGREGATE_VERSION') < 1) fail('STUDIO_PROJECTION');
  return value;
};

const studioCommand = async ({ api, context, projection, commandType, payload, label, interactionSequence, checkpointId = 'CH-03', stepId = 'generate-source-bound-document' }) => {
  const envelope = {
    requestId: randomUUID(), idempotencyKey: `pr264-browser-prerequisite-${label}-${randomUUID()}`,
    commandType, organizationId: context.organizationId, workspaceId: context.workspaceId,
    authorizationVersion: context.authorizationVersion, expectedAggregateVersion: Number(projection.aggregateVersion),
    expectedArtifactVersion: Number(projection.currentVersion.version), payload,
  };
  const result = successful(await api.invoke('studio-artifact-command', envelope,
    expectation(checkpointId, stepId, commandType)), commandType, projection.id);
  interactionSequence.push(`prerequisite:${checkpointId.toLowerCase()}:${label}`);
  return result;
};

const studioWorkspaceProjection = async (api, context, artifactId) => {
  const projection = await api.rpc('studio_artifact_workspace_projection_v2', {
    p_org: context.organizationId, p_workspace: context.workspaceId, p_artifact: artifactId,
    p_source_offset: 0, p_source_limit: 20,
  });
  const value = isRecord(projection?.projection) ? projection.projection : projection;
  if (!isRecord(value) || value.organizationId !== context.organizationId || value.workspaceId !== context.workspaceId
    || !isRecord(value.artifact) || id(value.artifact.id, 'STUDIO_WORKSPACE_ARTIFACT_ID') !== artifactId
    || !isRecord(value.sourcePackage) || !isRecord(value.selectedSources) || !isRecord(value.coverage)) fail('STUDIO_WORKSPACE_PROJECTION');
  return value;
};

const directStudioWorkspace = (value, { approved = false } = {}) => {
  const artifact = value.artifact; const sourcePackage = value.sourcePackage;
  const inputBundle = sourcePackage.inputBundle;
  if (sourcePackage.mode !== 'direct_transcript_bundle' || sourcePackage.lineageClassification !== 'not_assessed'
    || sourcePackage.planningOnly !== true || !HASH.test(String(sourcePackage.hash ?? '')) || !isRecord(inputBundle)) fail('STUDIO_DIRECT_SOURCE_PACKAGE');
  const bundle = { id: id(inputBundle.id, 'STUDIO_INPUT_BUNDLE_ID'), versionId: id(inputBundle.versionId, 'STUDIO_INPUT_BUNDLE_VERSION_ID'),
    version: positive(inputBundle.version, 'STUDIO_INPUT_BUNDLE_VERSION') };
  const selected = value.selectedSources;
  if (Number(selected.total) !== DIRECT_SOURCE_COUNT || Number(selected.offset) !== 0 || selected.hasMore !== false
    || !Array.isArray(selected.items) || selected.items.length !== DIRECT_SOURCE_COUNT) fail('STUDIO_DIRECT_SOURCE_COUNT');
  const sources = selected.items.map(item => {
    if (!isRecord(item) || typeof item.label !== 'string' || item.label.trim().length < 1) fail('STUDIO_DIRECT_SOURCE');
    return { sourceId: id(item.sourceId, 'STUDIO_SOURCE_ID'), sourceVersionId: id(item.sourceVersionId, 'STUDIO_SOURCE_VERSION_ID'), label: item.label };
  });
  if (new Set(sources.map(item => item.sourceId)).size !== DIRECT_SOURCE_COUNT
    || new Set(sources.map(item => item.sourceVersionId)).size !== DIRECT_SOURCE_COUNT) fail('STUDIO_DIRECT_SOURCE_DUPLICATE');
  if (approved) {
    const currentVersionId = id(artifact.currentVersionId, 'STUDIO_APPROVED_CURRENT_VERSION');
    if (artifact.lifecycle !== 'approved' || id(artifact.currentApprovedVersionId, 'STUDIO_APPROVED_VERSION') !== currentVersionId
      || value.coverage.complete !== true || !Array.isArray(value.coverage.selectedSourceVersionIds)
      || !Array.isArray(value.coverage.coveredSourceVersionIds) || !Array.isArray(value.coverage.uncoveredSourceVersionIds)
      || value.coverage.uncoveredSourceVersionIds.length !== 0) fail('STUDIO_DIRECT_APPROVED_STATE');
    const expected = [...sources.map(item => item.sourceVersionId)].sort();
    if (JSON.stringify([...value.coverage.selectedSourceVersionIds].sort()) !== JSON.stringify(expected)
      || JSON.stringify([...value.coverage.coveredSourceVersionIds].sort()) !== JSON.stringify(expected)) fail('STUDIO_DIRECT_COVERAGE');
  }
  return { inputBundle: bundle, sources };
};

export const readSyntheticStudioBundleBinding = async (sessionOrApi, artifactId) => {
  const api = apiFrom(sessionOrApi);
  if (!api || typeof api.context !== 'function' || typeof api.rpc !== 'function') fail('READ_STUDIO_API');
  const context = await contextFor(api, 'reader');
  const value = await studioWorkspaceProjection(api, context, id(artifactId, 'READ_STUDIO_ARTIFACT_ID'));
  return Object.freeze(directStudioWorkspace(value, { approved: true }));
};

const exactSyntheticTemplate = async (api, context) => {
  const projection = await api.rpc('studio_tenant_template_projection', { p_org: context.organizationId, p_workspace: context.workspaceId });
  if (!isRecord(projection) || projection.organizationId !== context.organizationId || projection.workspaceId !== context.workspaceId
    || !Array.isArray(projection.templates)) fail('CH10_TEMPLATE_PROJECTION');
  const matches = projection.templates.filter(value => value?.ownership === 'tenant' && value?.name === SYNTHETIC_TEMPLATE_NAME
    && value?.artifactClass === 'custom' && value?.lifecycle === 'approved' && Array.isArray(value?.actions)
    && value.actions.includes('studio.generation.request'));
  if (matches.length !== 1) fail('CH10_TEMPLATE_COUNT');
  const template = matches[0];
  return { kind: 'tenant', templateId: id(template.templateId, 'CH10_TEMPLATE_ID'),
    versionId: id(template.templateVersionId, 'CH10_TEMPLATE_VERSION_ID'), version: positive(template.version, 'CH10_TEMPLATE_VERSION'),
    hash: HASH.test(String(template.templateHash ?? '')) ? template.templateHash : fail('CH10_TEMPLATE_HASH') };
};

const enterpriseProjection = async (api, context, deliveryItemPage) => {
  const response = await api.invoke('enterprise-intelligence-query', {
    organizationId: context.organizationId, workspaceId: context.workspaceId,
    expectedAuthorizationVersion: context.authorizationVersion,
    ...(deliveryItemPage ? { deliveryItemPage } : {}),
  });
  const projection = response?.projection ?? response;
  if (!isRecord(projection)) fail('ENTERPRISE_PROJECTION');
  return projection;
};

const normalizeDeliveryItem = item => isRecord(item) && item.aggregateId === undefined && item.itemAggregateId !== undefined
  ? { ...item, aggregateId: item.itemAggregateId, currentVersionId: item.itemVersionId,
    type: typeof item.itemType === 'string' ? item.itemType.toLowerCase() : item.itemType }
  : item;

const normalizeDeliveryPackage = pkg => {
  if (!isRecord(pkg) || !Array.isArray(pkg.items)) return pkg;
  const reviewHistory = Array.isArray(pkg.reviewHistory) ? pkg.reviewHistory : [];
  const approvalHistory = Array.isArray(pkg.approvalHistory) ? pkg.approvalHistory : [];
  const reviewOutcome = reviewHistory.filter(event => event.packageVersion === pkg.currentVersion).at(-1)?.outcome;
  const approvalOutcome = approvalHistory.filter(event => event.packageVersion === pkg.currentVersion).at(-1)?.outcome;
  return {
    ...pkg, items: pkg.items.map(normalizeDeliveryItem),
    ...(pkg.reviewState === undefined ? { reviewState: reviewOutcome === 'changes_requested' ? 'changes_requested' : reviewOutcome ?? 'not_requested' } : {}),
    ...(pkg.approvalState === undefined ? { approvalState: approvalOutcome ?? (pkg.status === 'review' && reviewOutcome === 'approved' ? 'pending' : 'not_requested') } : {}),
  };
};

const deliveryWorkspace = async (api, context, deliveryItemPage) => {
  const projection = await enterpriseProjection(api, context, deliveryItemPage);
  const workspace = projection?.deliveryWorkspace;
  if (!isRecord(workspace)) fail('DELIVERY_PROJECTION_BODY');
  if (String(workspace.organizationId).toLowerCase() !== context.organizationId || String(workspace.workspaceId).toLowerCase() !== context.workspaceId) fail('DELIVERY_PROJECTION_SCOPE');
  if (!Array.isArray(workspace.packages)) fail('DELIVERY_PROJECTION_PACKAGES');
  const packages = workspace.packages.map(normalizeDeliveryPackage);
  if (Array.isArray(workspace.inbox) && Array.isArray(workspace.outbox)) return { ...workspace, packages };
  // The Edge query returns the strict SQL projection (`handoffs`); the normal
  // application decoder exposes the same rows split into inbox/outbox. Direct
  // synthetic reads accept both public shapes without changing any selectors.
  if (!Array.isArray(workspace.handoffs) || workspace.handoffs.some(value => !['inbox', 'outbox'].includes(value?.direction))) fail('DELIVERY_PROJECTION_HANDOFFS');
  return { ...workspace, packages, inbox: workspace.handoffs.filter(value => value.direction === 'inbox'), outbox: workspace.handoffs.filter(value => value.direction === 'outbox') };
};

const nextCursor = itemPage => {
  const cursor = itemPage?.nextCursor;
  if (!cursor) return null;
  return { version: positive(cursor.version, 'DELIVERY_CURSOR_VERSION'), id: id(cursor.id ?? cursor.itemId, 'DELIVERY_CURSOR_ID') };
};

const packageById = (workspace, packageId) => {
  const matches = workspace.packages.filter(value => String(value?.id).toLowerCase() === packageId);
  if (matches.length !== 1) fail('DELIVERY_PACKAGE_AMBIGUOUS');
  return matches[0];
};

const handoffById = (workspace, handoffId) => {
  const matches = [...workspace.inbox, ...workspace.outbox].filter(value => String(value?.id).toLowerCase() === handoffId);
  if (matches.length !== 1) fail('DELIVERY_HANDOFF_AMBIGUOUS');
  return matches[0];
};

const completePackage = async (api, context, packageId) => {
  const firstWorkspace = await deliveryWorkspace(api, context);
  const first = packageById(firstWorkspace, packageId);
  if (!Array.isArray(first.items) || !isRecord(first.itemPage)) fail('DELIVERY_ITEM_PAGE');
  const items = [...first.items];
  const seen = new Set(items.map(item => id(item.aggregateId, 'DELIVERY_ITEM_ID')));
  let cursor = nextCursor(first.itemPage);
  let pages = 1;
  while (cursor) {
    if (pages >= 3) fail('DELIVERY_PAGE_LIMIT');
    const pageWorkspace = await deliveryWorkspace(api, context, { packageId, cursor, limit: 100 });
    const page = packageById(pageWorkspace, packageId);
    if (!page.itemPage?.cursorApplied || !Array.isArray(page.items) || page.items.length < 1) fail('DELIVERY_PAGE_INVALID');
    for (const item of page.items) {
      const itemId = id(item.aggregateId, 'DELIVERY_ITEM_ID');
      if (seen.has(itemId)) fail('DELIVERY_ITEM_DUPLICATE');
      seen.add(itemId); items.push(item);
    }
    cursor = nextCursor(page.itemPage); pages += 1;
  }
  if (items.length < 1 || items.length > MAX_COMPLETE_ITEM_COUNT) fail('DELIVERY_ITEM_COUNT');
  return { workspace: firstWorkspace, deliveryPackage: first, items };
};

// Read helpers intentionally refresh tenant context on every call. They return
// ordinary browser-safe projections only; callers must keep opaque selectors in
// private in-memory state and never copy them into evidence artifacts.
export const readSyntheticStudioArtifact = async (sessionOrApi, artifactId) => {
  const api = apiFrom(sessionOrApi);
  if (!api || typeof api.context !== 'function' || typeof api.rpc !== 'function') fail('READ_STUDIO_API');
  const context = await contextFor(api, 'reader');
  return studioProjection(api, context, id(artifactId, 'READ_STUDIO_ARTIFACT_ID'));
};

export const readSyntheticDeliveryWorkspace = async (sessionOrApi, deliveryItemPage) => {
  const api = apiFrom(sessionOrApi);
  if (!api || typeof api.context !== 'function' || typeof api.invoke !== 'function') fail('READ_DELIVERY_API');
  const context = await contextFor(api, 'reader');
  return deliveryWorkspace(api, context, deliveryItemPage);
};

export const readSyntheticDeliveryPackage = async (sessionOrApi, packageId) => {
  const api = apiFrom(sessionOrApi);
  if (!api || typeof api.context !== 'function' || typeof api.invoke !== 'function') fail('READ_DELIVERY_API');
  const context = await contextFor(api, 'reader');
  return completePackage(api, context, id(packageId, 'READ_DELIVERY_PACKAGE_ID'));
};

const deliveryCommand = async ({ api, context, checkpointId, stepId, action, payload, label, interactionSequence, resourceId }) => {
  const result = successful(await api.invoke('enterprise-intelligence-command', {
    commandType: action, requestId: randomUUID(), idempotencyKey: `pr264-browser-prerequisite-${label}-${randomUUID()}`,
    organizationId: context.organizationId, workspaceId: context.workspaceId, payload,
  }, expectation(checkpointId, stepId, action)), action, resourceId);
  interactionSequence.push(`prerequisite:${checkpointId.toLowerCase()}:${label}`);
  return result;
};

const itemIdentity = item => ({
  itemAggregateId: id(item.aggregateId, 'DELIVERY_ITEM_ID'),
  expectedAggregateVersion: positive(item.aggregateVersion, 'DELIVERY_ITEM_VERSION'),
  expectedItemVersionId: id(item.currentVersionId, 'DELIVERY_ITEM_VERSION_ID'),
});

const acceptItems = async ({ api, context, checkpointId, stepId, packageId, leaveItemId = '', expectedCount, interactionSequence }) => {
  let snapshot = await completePackage(api, context, packageId);
  if (expectedCount !== undefined && snapshot.items.length !== expectedCount) fail('DELIVERY_COMPLETE_SET_COUNT');
  const targetIds = snapshot.items.map(item => id(item.aggregateId, 'DELIVERY_ITEM_ID'))
    .filter(itemId => itemId !== leaveItemId).sort();
  if (targetIds.length !== new Set(targetIds).size) fail('DELIVERY_ITEM_DUPLICATE');
  for (const targetId of targetIds) {
    const matches = snapshot.items.filter(item => String(item?.aggregateId).toLowerCase() === targetId);
    if (matches.length !== 1) fail('DELIVERY_ITEM_AMBIGUOUS');
    const item = matches[0];
    if (item.status === 'accepted') continue;
    if (!['proposed', 'edited'].includes(item.status)) fail('DELIVERY_ITEM_NOT_REVIEWABLE');
    const beforeAccepted = Number(snapshot.deliveryPackage.acceptedItemCount ?? snapshot.items.filter(value => value.status === 'accepted').length);
    const identity = itemIdentity(item);
    await deliveryCommand({ api, context, checkpointId, stepId, action: 'delivery.item.review',
      payload: { ...identity, outcome: 'accepted', rationale: 'Accept the exact current synthetic proposal.' },
      label: 'accept-current-proposal', interactionSequence, resourceId: targetId });
    const after = await completePackage(api, context, packageId);
    const accepted = after.items.filter(value => String(value?.aggregateId).toLowerCase() === targetId && value.status === 'accepted');
    const afterAccepted = after.items.filter(value => value.status === 'accepted').length;
    if (accepted.length !== 1 || afterAccepted !== beforeAccepted + 1) fail('DELIVERY_ITEM_POST_STATE');
    // This complete post-command projection proves the prior write and is the
    // fresh exact selector set for the next request.
    snapshot = after;
  }
  const final = await completePackage(api, context, packageId);
  const retained = final.items.filter(item => id(item.aggregateId, 'DELIVERY_ITEM_ID') === leaveItemId);
  if (leaveItemId && (retained.length !== 1 || retained[0].status === 'accepted')) fail('DELIVERY_FINAL_ITEM_STATE');
  if (final.items.filter(item => id(item.aggregateId, 'DELIVERY_ITEM_ID') !== leaveItemId).some(item => item.status !== 'accepted')) fail('DELIVERY_INCOMPLETE_DECISIONS');
  return final;
};

const runCh03 = async ({ sessions, state, interactionSequence }) => {
  const artifactId = id(state.get(SYNTHETIC_PREREQUISITE_STATE_KEYS.ch03ArtifactId), 'CH03_ARTIFACT_ID');
  const requesterApi = sessionApi(sessions, 'requester'); const reviewerApi = sessionApi(sessions, 'studio_reviewer');
  const requester = await contextFor(requesterApi, 'requester'); const reviewer = await contextFor(reviewerApi, 'studio_reviewer'); sameScope(requester, reviewer);
  let projection = await studioProjection(requesterApi, requester, artifactId);
  const versionId = id(projection.currentVersion.id, 'CH03_VERSION_ID');
  await studioCommand({ api: requesterApi, context: requester, projection, commandType: 'studio.artifact.review.submit',
    payload: { artifactId, artifactVersionId: versionId }, label: 'submit-generated-draft', interactionSequence });
  projection = await studioProjection(reviewerApi, reviewer, artifactId);
  if (id(projection.currentVersion.id, 'CH03_SUBMITTED_VERSION') !== versionId) fail('CH03_SUBMIT_POST_STATE');
  await studioCommand({ api: reviewerApi, context: reviewer, projection, commandType: 'studio.artifact.review.assign',
    payload: { artifactId, artifactVersionId: versionId, reviewerId: reviewer.userId }, label: 'assign-independent-reviewer', interactionSequence });
  projection = await studioProjection(reviewerApi, reviewer, artifactId);
  if (String(projection.review?.reviewerId).toLowerCase() !== reviewer.userId) fail('CH03_ASSIGN_POST_STATE');
  await studioCommand({ api: reviewerApi, context: reviewer, projection, commandType: 'studio.artifact.review.resolve',
    payload: { artifactId, artifactVersionId: versionId, outcome: 'approve', rationale: 'Independent synthetic review of the exact generated draft.', conditions: [] },
    label: 'approve-independent-review', interactionSequence });
  projection = await studioProjection(reviewerApi, reviewer, artifactId);
  if (projection.review?.outcome !== 'approved' || String(projection.review?.reviewerId).toLowerCase() !== reviewer.userId) fail('CH03_REVIEW_POST_STATE');
};

const runCh04 = async ({ sessions, state, interactionSequence }) => {
  const api = sessionApi(sessions, 'requester'); const context = await contextFor(api, 'requester');
  const source = state.get(SYNTHETIC_PREREQUISITE_STATE_KEYS.ch04RequestSource);
  if (!isRecord(source)) fail('CH04_REQUEST_SOURCE');
  const payload = {
    targetWorkspaceId: id(source.targetWorkspaceId, 'CH04_TARGET_WORKSPACE'), studioArtifactId: id(source.studioArtifactId, 'CH04_ARTIFACT_ID'),
    studioArtifactVersionId: id(source.studioArtifactVersionId, 'CH04_ARTIFACT_VERSION_ID'), expectedAggregateVersion: positive(source.expectedAggregateVersion, 'CH04_AGGREGATE_VERSION'),
    expectedCurrentVersionId: id(source.expectedCurrentVersionId, 'CH04_CURRENT_VERSION_ID'), expectedApprovedVersionId: id(source.expectedApprovedVersionId, 'CH04_APPROVED_VERSION_ID'),
  };
  if (payload.targetWorkspaceId !== context.workspaceId || payload.studioArtifactVersionId !== payload.expectedCurrentVersionId
    || payload.studioArtifactVersionId !== payload.expectedApprovedVersionId) fail('CH04_REQUEST_SOURCE_BINDING');
  const result = await deliveryCommand({ api, context, checkpointId: 'CH-04', stepId: 'verify-changes-create-no-target-draft', action: 'delivery.handoff.request',
    payload, label: 'request-fresh-exact-handoff', interactionSequence });
  const handoffId = id(result.resourceId, 'CH04_REPLACEMENT_HANDOFF_ID');
  const reviewerApi = sessionApi(sessions, 'delivery_target_acceptor'); const reviewer = await contextFor(reviewerApi, 'delivery_target_acceptor'); sameScope(context, reviewer);
  const workspace = await deliveryWorkspace(reviewerApi, reviewer); const handoff = handoffById(workspace, handoffId);
  if (positive(handoff.version, 'CH04_HANDOFF_VERSION') !== 1 || !['requested', 'target_review'].includes(handoff.status)) fail('CH04_REQUEST_POST_STATE');
  state.set(SYNTHETIC_PREREQUISITE_STATE_KEYS.ch04ReplacementHandoffId, handoffId);
};

const canonicalItemSet = full => {
  if (!Number.isSafeInteger(full?.itemCount) || full.itemCount < 1 || full.itemCount > MAX_COMPLETE_ITEM_COUNT
    || !Array.isArray(full.itemIds) || full.itemIds.length !== full.itemCount) fail('CATALOG_ITEM_SET');
  const itemIds = full.itemIds.map(value => id(value, 'CATALOG_ITEM_ID')).sort();
  if (new Set(itemIds).size !== full.itemCount) fail('CATALOG_ITEM_SET');
  return { count: full.itemCount, itemIds };
};

const assertCanonicalItemSet = (items, expected) => {
  const actual = items.map(item => id(item.aggregateId, 'COMPLETE_ITEM_ID')).sort();
  if (actual.length !== expected.count || actual.some((value, index) => value !== expected.itemIds[index])) fail('COMPLETE_ITEM_SET_MISMATCH');
};

const runCh06 = async ({ sessions, state, interactionSequence }) => {
  const full = state.get('full-governed-package');
  const packageId = id(full?.packageId, 'CH06_PACKAGE_ID'); const finalItemId = id(state.get(SYNTHETIC_PREREQUISITE_STATE_KEYS.ch06FinalItemId), 'CH06_FINAL_ITEM_ID');
  const expected = canonicalItemSet(full);
  const api = sessionApi(sessions, 'delivery_author'); const context = await contextFor(api, 'delivery_author');
  assertCanonicalItemSet((await completePackage(api, context, packageId)).items, expected);
  const final = await acceptItems({ api, context, checkpointId: 'CH-06', stepId: 'compare-immutable-descendant-history', packageId,
    leaveItemId: finalItemId, expectedCount: expected.count, interactionSequence });
  assertCanonicalItemSet(final.items, expected);
  if (final.items.filter(item => item.status === 'accepted').length !== expected.count - 1) fail('CH06_ACCEPTED_COUNT');
};

const runCh07 = async ({ sessions, state, interactionSequence }) => {
  const full = state.get('full-governed-package');
  const packageId = id(full?.packageId, 'CH07_PACKAGE_ID');
  const revisedItemId = id(state.get(SYNTHETIC_PREREQUISITE_STATE_KEYS.ch06FinalItemId), 'CH07_REVISED_ITEM_ID');
  const expected = canonicalItemSet(full);
  const api = sessionApi(sessions, 'delivery_author'); const context = await contextFor(api, 'delivery_author');
  const before = await completePackage(api, context, packageId);
  assertCanonicalItemSet(before.items, expected);
  const revised = before.items.filter(item => id(item.aggregateId, 'CH07_ITEM_ID') === revisedItemId);
  if (revised.length !== 1 || revised[0].status !== 'accepted'
    || before.items.filter(item => item.status === 'accepted').length !== 1
    || before.items.filter(item => item.status === 'proposed').length !== expected.count - 1
    || before.items.some(item => !['accepted', 'proposed'].includes(item.status))) fail('CH07_PRECONDITION_STATE');
  const final = await acceptItems({ api, context, checkpointId: 'CH-07', stepId: 'decide-revised-descendant', packageId,
    expectedCount: expected.count, interactionSequence });
  assertCanonicalItemSet(final.items, expected);
  if (final.items.some(item => item.status !== 'accepted')) fail('CH07_ACCEPTED_COUNT');
};

const decodeDirectGeneration = (result, expected) => {
  if (!isRecord(result) || result.ok !== true || result.outcome !== 'generation_completed'
    || !['committed', 'replayed'].includes(result.commandOutcome) || !UUID.test(String(result.receiptId ?? ''))
    || id(result.resourceId, 'CH10_GENERATION_RESOURCE_ID') !== expected.artifactId || !isRecord(result.resource)) fail('CH10_GENERATION_RESULT');
  const resource = result.resource;
  if (id(resource.artifactId, 'CH10_GENERATION_ARTIFACT_ID') !== expected.artifactId
    || id(resource.versionId, 'CH10_GENERATION_VERSION_ID') === '' || positive(resource.version, 'CH10_GENERATION_VERSION') < 1
    || id(resource.sourcePackageId, 'CH10_GENERATION_PACKAGE_ID') !== expected.sourcePackageId
    || positive(resource.sourcePackageVersion, 'CH10_GENERATION_PACKAGE_VERSION') !== expected.sourcePackageVersion
    || resource.sourcePackageHash !== expected.sourcePackageHash
    || id(resource.templateVersionId, 'CH10_GENERATION_TEMPLATE_VERSION_ID') !== expected.template.versionId
    || Number(resource.templateVersion) !== expected.template.version || resource.templateHash !== expected.template.hash
    || resource.generationKind !== 'synthetic_controlled_human' || resource.synthetic !== true) fail('CH10_GENERATION_BINDING');
  return { artifactId: expected.artifactId, versionId: String(resource.versionId).toLowerCase(), version: Number(resource.version) };
};

const runCh10StudioApproval = async ({ sessions, state, interactionSequence }) => {
  const artifactId = id(state.get(SYNTHETIC_PREREQUISITE_STATE_KEYS.ch10ArtifactId), 'CH10_ARTIFACT_ID');
  const catalogBindingToken = state.get(SYNTHETIC_PREREQUISITE_STATE_KEYS.ch10CatalogBindingToken);
  if (typeof catalogBindingToken !== 'string' || !DIGEST.test(catalogBindingToken)) fail('CH10_CATALOG_BINDING_TOKEN');
  const requesterApi = sessionApi(sessions, 'requester'); const reviewerApi = sessionApi(sessions, 'studio_reviewer');
  const approverApi = sessionApi(sessions, 'studio_approver');
  const requester = await contextFor(requesterApi, 'requester'); const reviewer = await contextFor(reviewerApi, 'studio_reviewer');
  const approver = await contextFor(approverApi, 'studio_approver'); sameScope(requester, reviewer); sameScope(requester, approver);
  if (new Set([requester.userId, reviewer.userId, approver.userId]).size !== 3) fail('CH10_STUDIO_DUTY_SEPARATION');

  const initial = await studioWorkspaceProjection(requesterApi, requester, artifactId);
  directStudioWorkspace(initial);
  if (initial.artifact.artifactType !== 'pdd' || Number(initial.artifact.aggregateVersion) !== 0
    || initial.artifact.currentVersionId !== null || initial.artifact.currentApprovedVersionId !== null) fail('CH10_SOURCE_ONLY_PDD');
  const template = await exactSyntheticTemplate(requesterApi, requester);
  const sourcePackageId = id(initial.sourcePackage.id, 'CH10_SOURCE_PACKAGE_ID');
  const sourcePackageVersion = positive(initial.sourcePackage.version, 'CH10_SOURCE_PACKAGE_VERSION');
  const sourcePackageHash = HASH.test(String(initial.sourcePackage.hash ?? '')) ? initial.sourcePackage.hash : fail('CH10_SOURCE_PACKAGE_HASH');
  const generationRequest = {
    requestId: randomUUID(), idempotencyKey: `pr264-browser-prerequisite-ch10-generate-${randomUUID()}`,
    organizationId: requester.organizationId, workspaceId: requester.workspaceId, authorizationVersion: requester.authorizationVersion,
    artifactId, sourcePackageId, sourcePackageVersion, sourcePackageHash,
    expectedAggregateVersion: 0, expectedCurrentVersionId: null, expectedApprovedVersionId: null,
    template, catalogBindingToken,
  };
  const generated = decodeDirectGeneration(await requesterApi.invoke(DIRECT_GENERATION_FUNCTION, generationRequest,
    expectation('CH-10', 'create-direct-studio-plan', DIRECT_GENERATION_ACTION)),
  { artifactId, sourcePackageId, sourcePackageVersion, sourcePackageHash, template });
  interactionSequence.push('prerequisite:ch-10:generate-exact-direct-pdd');

  let projection = await studioProjection(requesterApi, requester, artifactId);
  if (projection.artifactType !== 'pdd' || projection.lifecycle !== 'draft'
    || id(projection.currentVersion.id, 'CH10_DRAFT_VERSION_ID') !== generated.versionId
    || Number(projection.currentVersion.version) !== generated.version) fail('CH10_GENERATION_POST_STATE');
  await studioCommand({ api: requesterApi, context: requester, projection, commandType: 'studio.artifact.review.submit',
    payload: { artifactId, artifactVersionId: generated.versionId }, label: 'submit-direct-pdd', interactionSequence,
    checkpointId: 'CH-10', stepId: 'create-direct-studio-plan' });
  projection = await studioProjection(reviewerApi, reviewer, artifactId);
  if (projection.lifecycle !== 'reviewer_ready' || id(projection.currentVersion.id, 'CH10_SUBMITTED_VERSION') !== generated.versionId) fail('CH10_SUBMIT_POST_STATE');
  await studioCommand({ api: reviewerApi, context: reviewer, projection, commandType: 'studio.artifact.review.assign',
    payload: { artifactId, artifactVersionId: generated.versionId, reviewerId: reviewer.userId }, label: 'assign-direct-pdd-reviewer', interactionSequence,
    checkpointId: 'CH-10', stepId: 'create-direct-studio-plan' });
  projection = await studioProjection(reviewerApi, reviewer, artifactId);
  if (projection.lifecycle !== 'in_review' || String(projection.review?.reviewerId).toLowerCase() !== reviewer.userId) fail('CH10_ASSIGN_POST_STATE');
  await studioCommand({ api: reviewerApi, context: reviewer, projection, commandType: 'studio.artifact.review.resolve',
    payload: { artifactId, artifactVersionId: generated.versionId, outcome: 'approve', rationale: 'Independent review of the exact generated direct PDD.', conditions: [] },
    label: 'review-direct-pdd', interactionSequence, checkpointId: 'CH-10', stepId: 'create-direct-studio-plan' });
  projection = await studioProjection(approverApi, approver, artifactId);
  if (projection.lifecycle !== 'approval_ready' || projection.review?.outcome !== 'approved'
    || String(projection.review?.reviewerId).toLowerCase() !== reviewer.userId) fail('CH10_REVIEW_POST_STATE');
  await studioCommand({ api: approverApi, context: approver, projection, commandType: 'studio.artifact.approval.resolve',
    payload: { artifactId, artifactVersionId: generated.versionId, outcome: 'approve', rationale: 'Independent approval of the exact generated direct PDD.', conditions: [] },
    label: 'approve-direct-pdd', interactionSequence, checkpointId: 'CH-10', stepId: 'create-direct-studio-plan' });
  projection = await studioProjection(approverApi, approver, artifactId);
  if (projection.lifecycle !== 'approved' || id(projection.currentVersion.id, 'CH10_APPROVED_CURRENT_VERSION') !== generated.versionId
    || id(projection.currentApprovedVersion?.id, 'CH10_APPROVED_VERSION') !== generated.versionId
    || String(projection.approval?.approverId).toLowerCase() !== approver.userId || projection.approval?.outcome !== 'approved') fail('CH10_APPROVAL_POST_STATE');
  const approvedWorkspace = await studioWorkspaceProjection(approverApi, approver, artifactId);
  directStudioWorkspace(approvedWorkspace, { approved: true });
  if (approvedWorkspace.artifact.artifactType !== 'pdd' || id(approvedWorkspace.artifact.currentApprovedVersionId, 'CH10_APPROVED_WORKSPACE_VERSION') !== generated.versionId
    || id(approvedWorkspace.sourcePackage.id, 'CH10_APPROVED_SOURCE_PACKAGE') !== sourcePackageId
    || Number(approvedWorkspace.sourcePackage.version) !== sourcePackageVersion || approvedWorkspace.sourcePackage.hash !== sourcePackageHash) fail('CH10_APPROVED_WORKSPACE_BINDING');
  state.set(SYNTHETIC_PREREQUISITE_STATE_KEYS.ch10ApprovedCandidate, Object.freeze({
    studioArtifactId: artifactId, studioArtifactVersionId: generated.versionId, studioArtifactVersion: generated.version,
    aggregateVersion: positive(approvedWorkspace.artifact.aggregateVersion, 'CH10_APPROVED_AGGREGATE_VERSION'),
    artifactType: 'pdd', lineageClassification: 'not_assessed', planningOnly: true,
  }));
};

const runCh10 = async ({ sessions, state, interactionSequence }) => {
  const handoffId = id(state.get(SYNTHETIC_PREREQUISITE_STATE_KEYS.ch10HandoffId), 'CH10_HANDOFF_ID');
  const candidate = state.get(SYNTHETIC_PREREQUISITE_STATE_KEYS.ch10ApprovedCandidate);
  if (!isRecord(candidate) || id(candidate.studioArtifactId, 'CH10_APPROVED_ARTIFACT_ID') !== id(state.get(SYNTHETIC_PREREQUISITE_STATE_KEYS.ch10ArtifactId), 'CH10_ARTIFACT_ID')
    || candidate.artifactType !== 'pdd' || candidate.lineageClassification !== 'not_assessed' || candidate.planningOnly !== true) fail('CH10_APPROVED_CANDIDATE');
  const reviewerApi = sessionApi(sessions, 'delivery_target_acceptor'); const reviewer = await contextFor(reviewerApi, 'delivery_target_acceptor');
  let workspace = await deliveryWorkspace(reviewerApi, reviewer); let handoff = handoffById(workspace, handoffId);
  if (handoff.preview?.artifactType !== 'pdd' || Number(handoff.sourceArtifactVersion) !== Number(candidate.studioArtifactVersion)
    || handoff.lineageClassification !== 'not_assessed' || handoff.planningOnly !== true || positive(handoff.version, 'CH10_HANDOFF_VERSION') !== 1) fail('CH10_DIRECT_PDD_BINDING');
  await deliveryCommand({ api: reviewerApi, context: reviewer, checkpointId: 'CH-10', stepId: 'handoff-direct-studio-plan', action: 'delivery.handoff.review.resolve',
    payload: { handoffId, expectedHandoffVersion: 1, outcome: 'approved', rationale: 'Independent review of the exact direct planning handoff.' },
    label: 'review-direct-handoff', interactionSequence, resourceId: handoffId });
  workspace = await deliveryWorkspace(reviewerApi, reviewer); handoff = handoffById(workspace, handoffId);
  if (positive(handoff.version, 'CH10_REVIEW_VERSION') !== 2 || handoff.status !== 'approval_ready') fail('CH10_REVIEW_POST_STATE');
  const approverApi = sessionApi(sessions, 'delivery_approver'); const approver = await contextFor(approverApi, 'delivery_approver'); sameScope(reviewer, approver);
  await deliveryCommand({ api: approverApi, context: approver, checkpointId: 'CH-10', stepId: 'handoff-direct-studio-plan', action: 'delivery.handoff.approval.resolve',
    payload: { handoffId, expectedHandoffVersion: 2, outcome: 'approved', rationale: 'Independent approval of the exact direct planning handoff.' },
    label: 'approve-direct-handoff', interactionSequence, resourceId: handoffId });
  workspace = await deliveryWorkspace(approverApi, approver); handoff = handoffById(workspace, handoffId);
  if (positive(handoff.version, 'CH10_APPROVAL_VERSION') !== 3 || handoff.status !== 'approved') fail('CH10_APPROVAL_POST_STATE');
  const consumerApi = sessionApi(sessions, 'delivery_consumer'); const consumer = await contextFor(consumerApi, 'delivery_consumer'); sameScope(reviewer, consumer);
  const consumed = await deliveryCommand({ api: consumerApi, context: consumer, checkpointId: 'CH-10', stepId: 'handoff-direct-studio-plan', action: 'delivery.handoff.consume',
    payload: { handoffId, expectedHandoffVersion: 3 }, label: 'consume-direct-handoff', interactionSequence });
  const packageId = id(consumed.workPackageId ?? consumed.resourceId, 'CH10_PACKAGE_ID');
  workspace = await deliveryWorkspace(consumerApi, consumer); handoff = handoffById(workspace, handoffId);
  if (positive(handoff.version, 'CH10_CONSUMED_VERSION') !== 4 || handoff.status !== 'consumed') fail('CH10_CONSUME_POST_STATE');
  state.set(SYNTHETIC_PREREQUISITE_STATE_KEYS.ch10PackageId, packageId);
  const authorApi = sessionApi(sessions, 'delivery_author'); const author = await contextFor(authorApi, 'delivery_author'); sameScope(reviewer, author);
  const accepted = await acceptItems({ api: authorApi, context: author, checkpointId: 'CH-10', stepId: 'handoff-direct-studio-plan', packageId, interactionSequence });
  const pkg = accepted.deliveryPackage;
  if (pkg.sourcePackage?.sourceMode !== 'studio_handoff' || pkg.sourcePackage?.lineageClassification !== 'not_assessed' || pkg.sourcePackage?.planningOnly !== true
    || pkg.sourcePackage?.studioArtifactType !== 'pdd' || Number(pkg.sourcePackage?.studioArtifactVersion) !== Number(candidate.studioArtifactVersion)) fail('CH10_PACKAGE_LINEAGE');
  const packageReviewerApi = sessionApi(sessions, 'delivery_reviewer'); const packageReviewer = await contextFor(packageReviewerApi, 'delivery_reviewer'); sameScope(reviewer, packageReviewer);
  const reviewed = (await completePackage(packageReviewerApi, packageReviewer, packageId)).deliveryPackage;
  const payload = { workPackageId: packageId, expectedPackageVersion: positive(reviewed.currentVersion, 'CH10_PACKAGE_VERSION'),
    expectedPackageVersionId: id(reviewed.currentVersionId, 'CH10_PACKAGE_VERSION_ID'), expectedPackageAggregateVersion: positive(reviewed.aggregateVersion, 'CH10_PACKAGE_AGGREGATE_VERSION'),
    outcome: 'approved', rationale: 'Independent review of the complete direct planning package.' };
  const review = await deliveryCommand({ api: packageReviewerApi, context: packageReviewer, checkpointId: 'CH-10', stepId: 'handoff-direct-studio-plan', action: 'delivery.package.review.resolve',
    payload, label: 'review-direct-package', interactionSequence });
  // Package decisions return the immutable decision event as resourceId.
  // The separate workPackageId must bind that event to this exact package.
  if (id(review.workPackageId, 'CH10_PACKAGE_REVIEW_PACKAGE_ID') !== packageId
    || id(review.resourceId, 'CH10_PACKAGE_REVIEW_EVENT_ID') === packageId
    || review.resourceId.toLowerCase() === review.receiptId.toLowerCase()) fail('CH10_PACKAGE_REVIEW_BINDING');
  const post = (await completePackage(packageReviewerApi, packageReviewer, packageId)).deliveryPackage;
  if (post.reviewState !== 'approved') fail('CH10_PACKAGE_REVIEW_POST_STATE');
};

const runCh10Baseline = async ({ sessions, state, interactionSequence }) => {
  const packageId = id(state.get(SYNTHETIC_PREREQUISITE_STATE_KEYS.ch10PackageId), 'CH10_BASELINE_PACKAGE_ID');
  const api = sessionApi(sessions, 'delivery_approver'); const context = await contextFor(api, 'delivery_approver');
  const snapshot = await completePackage(api, context, packageId); const pkg = snapshot.deliveryPackage;
  if (pkg.status !== 'approved' || pkg.approvalState !== 'approved' || pkg.sourcePackage?.lineageClassification !== 'not_assessed' || pkg.sourcePackage?.planningOnly !== true
    || snapshot.items.some(item => item.status !== 'accepted')) fail('CH10_BASELINE_PACKAGE_STATE');
  const payload = { workPackageId: packageId, expectedPackageVersion: positive(pkg.currentVersion, 'CH10_BASELINE_PACKAGE_VERSION'),
    expectedPackageVersionId: id(pkg.currentVersionId, 'CH10_BASELINE_PACKAGE_VERSION_ID') };
  const result = await deliveryCommand({ api, context, checkpointId: 'CH-10', stepId: 'approve-direct-planning-package', action: 'monitor.baseline.create',
    payload, label: 'create-direct-planning-baseline', interactionSequence });
  const baselineId = id(result.resourceId, 'CH10_BASELINE_ID');
  const projection = await enterpriseProjection(api, context); const monitor = projection.monitorApprovedBaselines;
  if (!isRecord(monitor) || String(monitor.organizationId).toLowerCase() !== context.organizationId || String(monitor.workspaceId).toLowerCase() !== context.workspaceId
    || !Array.isArray(monitor.baselines)) fail('CH10_BASELINE_PROJECTION');
  const matches = monitor.baselines.filter(value => String(value?.id).toLowerCase() === baselineId && String(value?.workPackageId).toLowerCase() === packageId);
  if (matches.length !== 1 || matches[0].status !== 'approved' || matches[0].lineageClassification !== 'not_assessed' || matches[0].planningOnly !== true) fail('CH10_BASELINE_POST_STATE');
  state.set(SYNTHETIC_PREREQUISITE_STATE_KEYS.ch10BaselineId, baselineId);
};

const runCh11 = async ({ sessions, state, interactionSequence }) => {
  const packageId = id(state.get(SYNTHETIC_PREREQUISITE_STATE_KEYS.ch11PackageId), 'CH11_PACKAGE_ID');
  const api = sessionApi(sessions, 'delivery_author'); const context = await contextFor(api, 'delivery_author');
  const accepted = await acceptItems({ api, context, checkpointId: 'CH-11', stepId: 'create-manual-delivery-package', packageId, interactionSequence });
  const pkg = accepted.deliveryPackage;
  if (pkg.sourcePackage?.sourceMode !== 'manual' || pkg.sourcePackage?.lineageClassification !== 'not_assessed' || pkg.sourcePackage?.planningOnly !== true
    || accepted.items.some(item => item.status !== 'accepted')) fail('CH11_MANUAL_PACKAGE_STATE');
};

const HANDLERS = Object.freeze({
  'CH-03:approve-hybrid-studio-document': runCh03,
  'CH-04:reject-new-exact-handoff-request': runCh04,
  'CH-06:decide-every-current-proposal': runCh06,
  'CH-07:review-complete-revised-package': runCh07,
  'CH-10:handoff-direct-studio-plan': runCh10StudioApproval,
  'CH-10:approve-direct-planning-package': runCh10,
  'CH-10:verify-direct-plan-remains-not-assessed': runCh10Baseline,
  'CH-11:review-manual-delivery-package': runCh11,
});

export const runSyntheticPrerequisites = async ({ nextStep, sessions, state, interactionSequence }) => {
  if (!isRecord(nextStep) || !(sessions instanceof Map) || !(state instanceof Map) || !Array.isArray(interactionSequence)) fail('INPUT');
  const key = `${nextStep.checkpointId}:${nextStep.stepId}`;
  const handler = HANDLERS[key];
  if (!handler) return { applied: false, key };
  const marker = `prereq:completed:${key}`;
  if (state.get(marker) === true) return { applied: false, key };
  if (state.get(SYNTHETIC_PREREQUISITE_STATE_KEYS.lastCompletedStep) !== TRIGGERS[key]) fail('ORDER');
  await handler({ sessions, state, interactionSequence });
  state.set(marker, true);
  return { applied: true, key };
};

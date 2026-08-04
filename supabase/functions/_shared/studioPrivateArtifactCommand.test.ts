import {
  parseStudioPrivateArtifactEnvelope,
  parseStudioPrivateArtifactSqlCommand,
  StudioPrivateArtifactError,
  toStudioPrivateArtifactSqlCommand,
} from './studioPrivateArtifactCommand.ts';
import {
  handleStudioPrivateArtifactCommand,
  studioPrivateArtifactCommandHasPostCommitExternalEffect,
} from './studioPrivateArtifactHandler.ts';

const ids = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000005',
] as const;
const base = {
  requestId: ids[0],
  idempotencyKey: 'private-artifact-request-001',
  commandType: 'studio.rendition.generate',
  organizationId: ids[1],
  workspaceId: ids[2],
  authorizationVersion: 9,
  expectedArtifactVersion: 4,
  expectedRenditionVersion: null,
  payload: {
    artifactId: ids[3],
    artifactVersionId: ids[4],
    format: 'pdf',
  },
};
const assert = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};
const rejects = (value: unknown) => {
  try {
    parseStudioPrivateArtifactEnvelope(value);
    return false;
  } catch (error) {
    return error instanceof StudioPrivateArtifactError;
  }
};

assert(
  parseStudioPrivateArtifactEnvelope(base).payload.format === 'pdf',
  'generate parses',
);
const validCommands = [
  [
    'studio.retention.policy.publish',
    { artifactType: 'brd', retentionDays: null, reason: 'Indefinite default' },
    null,
    null,
  ],
  [
    'studio.rendition.retention.extend',
    {
      renditionId: ids[3],
      retentionUntil: '2028-07-29T00:00:00.000Z',
      reason: 'Approved extension',
    },
    4,
    2,
  ],
  ['studio.legal_hold.place', { renditionId: ids[3], reason: 'Matter open' }, 4, 2],
  ['studio.legal_hold.release', { renditionId: ids[3], holdId: ids[4], reason: 'Matter closed' }, 4, 2],
  [
    'studio.rendition.deletion.request',
    { renditionId: ids[3], reason: 'Approved disposal request' },
    4,
    2,
  ],
  [
    'studio.rendition.deletion.resolve',
    {
      renditionId: ids[3],
      deletionRequestId: ids[4],
      outcome: 'approve',
      reason: 'Independent approval',
    },
    4,
    2,
  ],
] as const;
for (const [commandType, payload, expectedArtifactVersion, expectedRenditionVersion] of validCommands) {
  assert(
    parseStudioPrivateArtifactEnvelope({
      ...base,
      commandType,
      payload,
      expectedArtifactVersion,
      expectedRenditionVersion,
    }).commandType === commandType,
    `${commandType} parses`,
  );
}

const serverActorId = '10000000-0000-4000-8000-000000000006';
const translationCases = [
  [base, base.payload],
  [
    { ...base, commandType: 'studio.retention.policy.publish', payload: { artifactType: 'brd', retentionDays: null, reason: 'Policy' }, expectedArtifactVersion: null },
    { artifactType: 'brd', retentionDays: null, indefinite: true, rationale: 'Policy' },
  ],
  [
    { ...base, commandType: 'studio.rendition.retention.extend', payload: { renditionId: ids[3], retentionUntil: '2028-07-29T00:00:00.000Z', reason: 'Extend' }, expectedRenditionVersion: 2 },
    { renditionId: ids[3], extendUntil: '2028-07-29T00:00:00.000Z', indefinite: false, rationale: 'Extend' },
  ],
  [
    { ...base, commandType: 'studio.legal_hold.place', payload: { renditionId: ids[3], reason: 'Place' }, expectedRenditionVersion: 2 },
    { renditionId: ids[3], rationale: 'Place' },
  ],
  [
    { ...base, commandType: 'studio.legal_hold.release', payload: { renditionId: ids[3], holdId: ids[4], reason: 'Release' }, expectedRenditionVersion: 2 },
    { renditionId: ids[3], holdId: ids[4], rationale: 'Release' },
  ],
  [
    { ...base, commandType: 'studio.rendition.deletion.request', payload: { renditionId: ids[3], reason: 'Dispose' }, expectedRenditionVersion: 2 },
    { renditionId: ids[3], rationale: 'Dispose' },
  ],
  [
    { ...base, commandType: 'studio.rendition.deletion.resolve', payload: { renditionId: ids[3], deletionRequestId: ids[4], outcome: 'approve', reason: 'Approve' }, expectedRenditionVersion: 2 },
    { renditionId: ids[3], deletionRequestId: ids[4], outcome: 'approve', rationale: 'Approve' },
  ],
] as const;
for (const [publicCommand, expectedPayload] of translationCases) {
  const translated = toStudioPrivateArtifactSqlCommand(publicCommand, serverActorId);
  assert(translated.actorId === serverActorId, 'server actor is authoritative');
  assert(
    JSON.stringify(translated.payload) === JSON.stringify(expectedPayload),
    `${publicCommand.commandType} uses exact SQL vocabulary`,
  );
  assert(
    translated.expectedArtifactVersion === publicCommand.expectedArtifactVersion &&
      translated.expectedRenditionVersion === publicCommand.expectedRenditionVersion,
    `${publicCommand.commandType} preserves expected versions`,
  );
  assert(Boolean(parseStudioPrivateArtifactSqlCommand(translated)), 'translated SQL command reparses');
}
const deletionRejectionCommand = {
  ...base,
  commandType: 'studio.rendition.deletion.resolve',
  payload: {
    renditionId: ids[3],
    deletionRequestId: ids[4],
    outcome: 'reject',
    reason: 'Reject deletion',
  },
  expectedRenditionVersion: 2,
};
for (const [publicCommand, expectedExternalEffect] of [
  [translationCases[0][0], true],
  [translationCases[1][0], false],
  [translationCases[2][0], false],
  [translationCases[3][0], false],
  [translationCases[4][0], false],
  [translationCases[5][0], false],
  [translationCases[6][0], true],
  [deletionRejectionCommand, false],
] as const) {
  assert(
    studioPrivateArtifactCommandHasPostCommitExternalEffect(
      toStudioPrivateArtifactSqlCommand(publicCommand, serverActorId),
    ) === expectedExternalEffect,
    `${publicCommand.commandType} has the exact post-commit effect classification`,
  );
}
assert(
  rejects({ ...base, actorId: serverActorId }),
  'browser-supplied actor is rejected before translation',
);
try {
  parseStudioPrivateArtifactSqlCommand({
    ...toStudioPrivateArtifactSqlCommand(translationCases[1][0], serverActorId),
    payload: {
      ...translationCases[1][1],
      indefinite: false,
    },
  });
  assert(false, 'inconsistent indefinite policy rejected');
} catch (error) {
  assert(error instanceof StudioPrivateArtifactError, 'private parser rejects inconsistency');
}

for (const valid of [
  {
    ...base,
    commandType: 'studio.retention.policy.publish',
    payload: { artifactType: 'frd', retentionDays: 30, reason: 'Finite policy' },
    expectedArtifactVersion: null,
    expectedRenditionVersion: null,
  },
  {
    ...base,
    commandType: 'studio.rendition.retention.extend',
    payload: { renditionId: ids[3], retentionUntil: null, reason: 'Indefinite extension' },
    expectedRenditionVersion: 2,
  },
  {
    ...base,
    commandType: 'studio.rendition.deletion.resolve',
    payload: { renditionId: ids[3], deletionRequestId: ids[4], outcome: 'reject', reason: 'Rejected' },
    expectedRenditionVersion: 2,
  },
]) {
  assert(Boolean(parseStudioPrivateArtifactEnvelope(valid)), 'additional valid branch parses');
}
for (const invalid of [
  { ...base, commandType: null },
  {
    ...base,
    commandType: 'studio.retention.policy.publish',
    payload: { artifactType: 'unknown', retentionDays: 30, reason: 'Invalid type' },
    expectedArtifactVersion: null,
    expectedRenditionVersion: null,
  },
  {
    ...base,
    commandType: 'studio.retention.policy.publish',
    payload: { artifactType: 'brd', retentionDays: 0, reason: 'Invalid duration' },
    expectedArtifactVersion: null,
    expectedRenditionVersion: null,
  },
  {
    ...base,
    commandType: 'studio.retention.policy.publish',
    payload: { artifactType: 'brd', retentionDays: 1.5, reason: 'Invalid duration' },
    expectedArtifactVersion: null,
    expectedRenditionVersion: null,
  },
]) {
  assert(rejects(invalid), 'additional adversarial branch rejected');
}
const forbiddenAuthority = [
  'bucket',
  'objectKey',
  'sha256',
  'byteLength',
  'mimeType',
  'rendererVersion',
  'templateVersion',
  'storageProvider',
  'ancestry',
  'lifecycle',
];
for (const field of forbiddenAuthority) {
  assert(
    rejects({ ...base, payload: { ...base.payload, [field]: 'forbidden' } }),
    `${field} browser authority rejected`,
  );
}
for (const invalid of [
  { ...base, extra: true },
  { ...base, expectedArtifactVersion: null },
  { ...base, expectedRenditionVersion: 1 },
  { ...base, payload: { ...base.payload, format: 'html' } },
  { ...base, idempotencyKey: 'short' },
  { ...base, commandType: 'studio.rendition.unknown' },
  {
    ...base,
    commandType: 'studio.rendition.deletion.resolve',
    expectedRenditionVersion: 2,
    payload: {
      renditionId: ids[3],
      deletionRequestId: ids[4],
      outcome: 'delete',
      reason: 'invalid outcome',
    },
  },
  {
    ...base,
    commandType: 'studio.rendition.retention.extend',
    expectedRenditionVersion: 2,
    payload: {
      renditionId: ids[3],
      retentionUntil: 'not-a-date',
      reason: 'invalid date',
    },
  },
]) {
  assert(rejects(invalid), 'adversarial command rejected');
}

const request = (body: unknown = base) =>
  new Request('https://local/studio-private-artifact-command', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const calls: string[] = [];
const committed = {
  outcome: 'committed' as const,
  receiptId: ids[4],
  resourceId: ids[3],
  resource: { state: 'requested' },
  renditionClaim: {
    disposition: 'execute' as const,
    requestId: ids[0],
    attemptId: ids[4],
    renditionId: ids[3],
    organizationId: ids[1],
    workspaceId: ids[2],
    opaqueObjectId: ids[4],
    artifactId: ids[3],
    artifactVersionId: ids[4],
    artifactType: 'brd' as const,
    format: 'pdf' as const,
    approvedContent: { title: 'Approved BRD' },
    contentSchemaVersion: 'studio-artifact-1',
    rendererVersion: 'studio-pdf-1' as const,
    templateVersion: 'studio-brd-1',
    reconciliationCount: 0,
  },
};
const dependencies = {
  authenticate: async () => {
    calls.push('authenticate');
    return { id: ids[0] };
  },
  loadFreshAuthority: async () => {
    calls.push('authorize');
    return {
      actorId: ids[0],
      organizationId: ids[1],
      workspaceId: ids[2],
      authorizationVersion: 9,
      capabilities: ['studio.artifacts.rendition.generate'],
    };
  },
  executeAtomicCommand: async () => {
    calls.push('claim');
    return committed;
  },
  executeClaimedRendition: async () => {
    calls.push('render-upload-complete');
    return { state: 'available' as const, resource: { state: 'available' } };
  },
};

void (async () => {
  const ok = await handleStudioPrivateArtifactCommand(request(), dependencies);
  assert(ok.status === 201, 'authorized generation succeeds');
  assert(
    calls.join(',') === 'authenticate,authorize,claim,render-upload-complete',
    'fresh authority precedes receipt and external effect',
  );
  calls.length = 0;
  const replay = await handleStudioPrivateArtifactCommand(request(), {
    ...dependencies,
    executeAtomicCommand: async () => {
      calls.push('claim');
      const { renditionClaim: _privateClaim, ...safeReplay } = committed;
      return { ...safeReplay, outcome: 'replayed' as const };
    },
  });
  assert(replay.status === 200, 'exact replay returns committed receipt');
  assert(
    calls.join(',') === 'authenticate,authorize,claim',
    'exact replay performs no render, upload, or delete',
  );
  calls.length = 0;
  const databaseOnlyReplayCases = [
    {
      label: 'retention policy publish',
      body: translationCases[1][0],
      capability: 'studio.artifacts.retention.manage',
    },
    {
      label: 'retention extension',
      body: translationCases[2][0],
      capability: 'studio.artifacts.retention.manage',
    },
    {
      label: 'legal-hold placement',
      body: translationCases[3][0],
      capability: 'studio.artifacts.legal_hold.manage',
    },
    {
      label: 'legal-hold release',
      body: translationCases[4][0],
      capability: 'studio.artifacts.legal_hold.manage',
    },
    {
      label: 'deletion request',
      body: translationCases[5][0],
      capability: 'studio.artifacts.delete.request',
    },
    {
      label: 'rejected deletion resolution',
      body: deletionRejectionCommand,
      capability: 'studio.artifacts.delete.approve',
    },
  ] as const;
  for (const replayCase of databaseOnlyReplayCases) {
    let atomicCalls = 0;
    let externalCalls = 0;
    const recovered = await handleStudioPrivateArtifactCommand(
      request(replayCase.body),
      {
        authenticate: async () => ({ id: ids[0] }),
        loadFreshAuthority: async () => ({
          actorId: ids[0],
          organizationId: ids[1],
          workspaceId: ids[2],
          authorizationVersion: 9,
          capabilities: [replayCase.capability],
        }),
        executeAtomicCommand: async () => {
          atomicCalls += 1;
          if (atomicCalls === 1) throw new Error('response lost after commit');
          return {
            outcome: 'replayed' as const,
            receiptId: ids[4],
            resourceId: ids[3],
            resource: { state: 'committed', version: 3 },
          };
        },
        executeClaimedRendition: async () => {
          externalCalls += 1;
          return { state: 'available' as const, resource: { state: 'available' } };
        },
        executeClaimedDeletion: async () => {
          externalCalls += 1;
          return { state: 'deleted' as const, resource: { state: 'deleted' } };
        },
      },
    );
    const body = await recovered.json() as Record<string, unknown>;
    const serialized = JSON.stringify(body);
    assert(
      atomicCalls === 2 &&
        externalCalls === 0 &&
        recovered.status === 200 &&
        body.ok === true &&
        body.outcome === 'replayed' &&
        body.receiptId === ids[4] &&
        body.resourceId === ids[3] &&
        JSON.stringify(body.resource) === JSON.stringify({ state: 'committed', version: 3 }) &&
        !serialized.includes('committed_reconciliation_pending') &&
        !serialized.includes('failed_before_commit') &&
        !serialized.includes('renditionClaim') &&
        !serialized.includes('deletionClaim') &&
        !serialized.includes('objectKey') &&
        !serialized.includes('bucket') &&
        !serialized.includes('provider') &&
        !serialized.includes('credential') &&
        !serialized.includes('signedUrl'),
      `${replayCase.label} returns the committed replay with zero external calls`,
    );
  }
  let freshDatabaseExternalCalls = 0;
  const freshDatabaseCommit = await handleStudioPrivateArtifactCommand(
    request(translationCases[1][0]),
    {
      ...dependencies,
      loadFreshAuthority: async () => ({
        actorId: ids[0],
        organizationId: ids[1],
        workspaceId: ids[2],
        authorizationVersion: 9,
        capabilities: ['studio.artifacts.retention.manage'],
      }),
      executeAtomicCommand: async () => ({
        outcome: 'committed' as const,
        receiptId: ids[4],
        resourceId: ids[3],
        resource: { state: 'committed' },
      }),
      executeClaimedRendition: async () => {
        freshDatabaseExternalCalls += 1;
        return { state: 'available' as const, resource: { state: 'available' } };
      },
      executeClaimedDeletion: async () => {
        freshDatabaseExternalCalls += 1;
        return { state: 'deleted' as const, resource: { state: 'deleted' } };
      },
    },
  );
  assert(
    freshDatabaseCommit.status === 201 &&
      (await freshDatabaseCommit.json() as Record<string, unknown>).outcome === 'committed' &&
      freshDatabaseExternalCalls === 0,
    'fresh database-only commit remains HTTP 201 with zero external calls',
  );
  let unsafeDatabaseExternalCalls = 0;
  const unsafeDatabaseProjection = await handleStudioPrivateArtifactCommand(
    request(translationCases[1][0]),
    {
      ...dependencies,
      loadFreshAuthority: async () => ({
        actorId: ids[0],
        organizationId: ids[1],
        workspaceId: ids[2],
        authorizationVersion: 9,
        capabilities: ['studio.artifacts.retention.manage'],
      }),
      executeAtomicCommand: async () => ({
        outcome: 'committed' as const,
        receiptId: ids[4],
        resourceId: ids[3],
        resource: { bucket: 'private' },
      }),
      executeClaimedRendition: async () => {
        unsafeDatabaseExternalCalls += 1;
        return { state: 'available' as const, resource: { state: 'available' } };
      },
      executeClaimedDeletion: async () => {
        unsafeDatabaseExternalCalls += 1;
        return { state: 'deleted' as const, resource: { state: 'deleted' } };
      },
    },
  );
  const unsafeDatabaseProjectionBody =
    await unsafeDatabaseProjection.json() as Record<string, unknown>;
  assert(
    unsafeDatabaseProjection.status === 201 &&
      unsafeDatabaseProjectionBody.ok === true &&
      unsafeDatabaseProjectionBody.outcome === 'committed' &&
      JSON.stringify(unsafeDatabaseProjectionBody.resource) === '{}' &&
      !JSON.stringify(unsafeDatabaseProjectionBody).includes('bucket') &&
      !JSON.stringify(unsafeDatabaseProjectionBody).includes('reconciliation') &&
      unsafeDatabaseExternalCalls === 0,
    'database-only post-commit projection rejection returns a non-disclosing committed result',
  );
  const stale = await handleStudioPrivateArtifactCommand(request(), {
    ...dependencies,
    loadFreshAuthority: async () => {
      calls.push('authorize');
      return {
        actorId: ids[0],
        organizationId: ids[1],
        workspaceId: ids[2],
        authorizationVersion: 10,
        capabilities: ['studio.artifacts.rendition.generate'],
      };
    },
  });
  assert(stale.status === 409 && !calls.includes('claim'), 'stale authority denied before receipt');
  const hidden = await handleStudioPrivateArtifactCommand(request(), {
    ...dependencies,
    loadFreshAuthority: async () => null,
  });
  assert(hidden.status === 404, 'foreign scope is non-disclosing');
  const denied = await handleStudioPrivateArtifactCommand(request(), {
    ...dependencies,
    loadFreshAuthority: async () => ({
      actorId: ids[0],
      organizationId: ids[1],
      workspaceId: ids[2],
      authorizationVersion: 9,
      capabilities: ['studio.artifacts.read'],
    }),
  });
  assert(denied.status === 403, 'narrow capability required');
  const leak = await handleStudioPrivateArtifactCommand(request(), {
    ...dependencies,
    executeAtomicCommand: async () => ({
      ...committed,
      resource: { bucket: 'private' },
    }),
  });
  const leakBody = await leak.json() as Record<string, unknown>;
  assert(
    leak.status === 202 &&
      leakBody.outcome === 'committed_reconciliation_pending' &&
      leakBody.receiptId === ids[4] &&
      !JSON.stringify(leakBody).includes('bucket'),
    'post-commit private storage coordinates fail closed with the original receipt',
  );
  const missingClaim = await handleStudioPrivateArtifactCommand(request(), {
    ...dependencies,
    executeAtomicCommand: async () => {
      const { renditionClaim: _claim, ...withoutClaim } = committed;
      return withoutClaim;
    },
  });
  const missingClaimBody = await missingClaim.json() as Record<string, unknown>;
  assert(
    missingClaim.status === 202 &&
      missingClaimBody.outcome === 'committed_reconciliation_pending' &&
      missingClaimBody.receiptId === ids[4],
    'missing executable claim remains committed and reconciliation pending',
  );
  for (const label of [
    'missing Storage configuration',
    'provider adapter construction failure',
    'RPC failure after command claim',
  ]) {
    const pending = await handleStudioPrivateArtifactCommand(request(), {
      ...dependencies,
      executeClaimedRendition: async () => {
        throw new Error(label);
      },
    });
    const body = await pending.json() as Record<string, unknown>;
    assert(
      pending.status === 202 &&
        body.ok === false &&
        body.outcome === 'committed_reconciliation_pending' &&
        body.receiptId === ids[4] &&
        body.resourceId === ids[3] &&
        !('renditionClaim' in body) &&
        !('deletionClaim' in body) &&
        !JSON.stringify(body).includes('objectKey') &&
        !JSON.stringify(body).includes('failed_before_commit'),
      `${label} preserves truthful receipt-only pending response`,
    );
  }
  for (const failureCode of [
    'UPLOAD_OUTCOME_UNKNOWN',
    'AVAILABLE_COMPLETION_FAILED',
  ]) {
    const pending = await handleStudioPrivateArtifactCommand(request(), {
      ...dependencies,
      executeClaimedRendition: async () => ({
        state: 'reconciliation_required' as const,
        failureCode,
      }),
    });
    const body = await pending.json() as Record<string, unknown>;
    const serialized = JSON.stringify(body);
    assert(
      pending.status === 202 &&
        body.ok === false &&
        body.outcome === 'committed_reconciliation_pending' &&
        body.receiptId === ids[4] &&
        body.resourceId === ids[3] &&
        JSON.stringify(body.resource) === JSON.stringify({ state: 'requested' }) &&
        !serialized.includes(failureCode) &&
        !serialized.includes('rendition_failed') &&
        !serialized.includes('failed_before_commit') &&
        !serialized.includes('renditionClaim') &&
        !serialized.includes('deletionClaim') &&
        !serialized.includes('objectKey') &&
        !serialized.includes('bucket') &&
        !serialized.includes('provider'),
      `${failureCode} returns the original safe receipt as HTTP 202 pending`,
    );
  }
  for (const failureCode of ['RENDER_FAILED', 'RECONCILIATION_EXHAUSTED']) {
    const failed = await handleStudioPrivateArtifactCommand(request(), {
      ...dependencies,
      executeClaimedRendition: async () => ({
        state: 'failed' as const,
        failureCode,
      }),
    });
    const body = await failed.json() as Record<string, unknown>;
    assert(
      failed.status === 200 && body.outcome === 'rendition_failed',
      `${failureCode} remains a terminal rendition failure`,
    );
  }
  let transportClaims = 0;
  let recoveredRenditionExternalCalls = 0;
  const recoveredTransport = await handleStudioPrivateArtifactCommand(request(), {
    ...dependencies,
    executeAtomicCommand: async () => {
      transportClaims += 1;
      if (transportClaims === 1) throw new Error('response lost after commit');
      const { renditionClaim: _claim, ...safeReplay } = committed;
      return { ...safeReplay, outcome: 'replayed' as const };
    },
    executeClaimedRendition: async () => {
      recoveredRenditionExternalCalls += 1;
      return { state: 'available' as const, resource: { state: 'available' } };
    },
  });
  const recoveredTransportBody =
    await recoveredTransport.json() as Record<string, unknown>;
  const recoveredTransportSerialized = JSON.stringify(recoveredTransportBody);
  assert(
    transportClaims === 2 &&
      recoveredRenditionExternalCalls === 0 &&
      recoveredTransport.status === 202 &&
      recoveredTransportBody.ok === false &&
      recoveredTransportBody.receiptId === ids[4] &&
      recoveredTransportBody.resourceId === ids[3] &&
      recoveredTransportBody.outcome === 'committed_reconciliation_pending' &&
      !recoveredTransportSerialized.includes('renditionClaim') &&
      !recoveredTransportSerialized.includes('deletionClaim') &&
      !recoveredTransportSerialized.includes('objectKey') &&
      !recoveredTransportSerialized.includes('bucket') &&
      !recoveredTransportSerialized.includes('provider'),
    'lost generation response preserves pending receipt without repeating the external saga',
  );
  const deletionBody = {
    ...base,
    commandType: 'studio.rendition.deletion.resolve',
    expectedRenditionVersion: 3,
    payload: {
      renditionId: ids[3],
      deletionRequestId: ids[4],
      outcome: 'approve',
      reason: 'Independent approval',
    },
  };
  const committedDeletion = {
    outcome: 'committed' as const,
    receiptId: ids[4],
    resourceId: ids[3],
    resource: { state: 'deleting' },
    deletionClaim: {
      disposition: 'execute' as const,
      requestId: ids[0],
      deletionAttemptId: ids[4],
      renditionId: ids[3],
      organizationId: ids[1],
      workspaceId: ids[2],
      reconciliationCount: 0,
    },
  };
  const deletionDependencies = {
    ...dependencies,
    loadFreshAuthority: async () => ({
      actorId: ids[0],
      organizationId: ids[1],
      workspaceId: ids[2],
      authorizationVersion: 9,
      capabilities: ['studio.artifacts.delete.approve'],
    }),
    executeAtomicCommand: async () => committedDeletion,
  };
  let deletionReplayAtomicCalls = 0;
  let deletionReplayExternalCalls = 0;
  const recoveredApprovedDeletion = await handleStudioPrivateArtifactCommand(
    request(deletionBody),
    {
      ...deletionDependencies,
      executeAtomicCommand: async () => {
        deletionReplayAtomicCalls += 1;
        if (deletionReplayAtomicCalls === 1) {
          throw new Error('deletion resolution response lost after commit');
        }
        const { deletionClaim: _claim, ...safeReplay } = committedDeletion;
        return { ...safeReplay, outcome: 'replayed' as const };
      },
      executeClaimedDeletion: async () => {
        deletionReplayExternalCalls += 1;
        return { state: 'deleted' as const, resource: { state: 'deleted' } };
      },
    },
  );
  const recoveredApprovedDeletionBody =
    await recoveredApprovedDeletion.json() as Record<string, unknown>;
  const recoveredApprovedDeletionSerialized =
    JSON.stringify(recoveredApprovedDeletionBody);
  assert(
    deletionReplayAtomicCalls === 2 &&
      deletionReplayExternalCalls === 0 &&
      recoveredApprovedDeletion.status === 202 &&
      recoveredApprovedDeletionBody.ok === false &&
      recoveredApprovedDeletionBody.outcome === 'committed_reconciliation_pending' &&
      recoveredApprovedDeletionBody.receiptId === ids[4] &&
      recoveredApprovedDeletionBody.resourceId === ids[3] &&
      !recoveredApprovedDeletionSerialized.includes('renditionClaim') &&
      !recoveredApprovedDeletionSerialized.includes('deletionClaim') &&
      !recoveredApprovedDeletionSerialized.includes('objectKey') &&
      !recoveredApprovedDeletionSerialized.includes('bucket') &&
      !recoveredApprovedDeletionSerialized.includes('provider'),
    'lost approved-deletion response remains pending without repeating physical deletion',
  );
  const freshApprovedDeletion = await handleStudioPrivateArtifactCommand(
    request(deletionBody),
    {
      ...deletionDependencies,
      executeClaimedDeletion: async () => ({
        state: 'deleted' as const,
        resource: { state: 'deleted' },
      }),
    },
  );
  assert(
    freshApprovedDeletion.status === 201 &&
      (await freshApprovedDeletion.json() as Record<string, unknown>).outcome ===
        'deletion_completed',
    'fresh approved deletion external success remains HTTP 201',
  );
  for (const failureCode of [
    'DELETE_OUTCOME_UNKNOWN',
    'TOMBSTONE_COMPLETION_FAILED',
  ]) {
    const pending = await handleStudioPrivateArtifactCommand(
      request(deletionBody),
      {
        ...deletionDependencies,
        executeClaimedDeletion: async () => ({
          state: 'reconciliation_required' as const,
          failureCode,
        }),
      },
    );
    const body = await pending.json() as Record<string, unknown>;
    const serialized = JSON.stringify(body);
    assert(
      pending.status === 202 &&
        body.ok === false &&
        body.outcome === 'committed_reconciliation_pending' &&
        body.receiptId === ids[4] &&
        body.resourceId === ids[3] &&
        JSON.stringify(body.resource) === JSON.stringify({ state: 'deleting' }) &&
        !serialized.includes(failureCode) &&
        !serialized.includes('deletion_failed') &&
        !serialized.includes('failed_before_commit') &&
        !serialized.includes('renditionClaim') &&
        !serialized.includes('deletionClaim') &&
        !serialized.includes('objectKey') &&
        !serialized.includes('bucket') &&
        !serialized.includes('provider'),
      `${failureCode} returns the original safe receipt as HTTP 202 pending`,
    );
  }
  const deletionExhausted = await handleStudioPrivateArtifactCommand(
    request(deletionBody),
    {
      ...deletionDependencies,
      executeClaimedDeletion: async () => ({
        state: 'failed' as const,
        failureCode: 'DELETION_RECONCILIATION_EXHAUSTED',
      }),
    },
  );
  assert(
    deletionExhausted.status === 200 &&
      (await deletionExhausted.json() as Record<string, unknown>).outcome ===
        'deletion_failed',
    'bounded deletion exhaustion remains a terminal deletion failure',
  );
  const deletionPending = await handleStudioPrivateArtifactCommand(
    request(deletionBody),
    {
      ...deletionDependencies,
      executeClaimedDeletion: async () => {
        throw new Error('deletion execution guard rejected after resolution commit');
      },
    },
  );
  const deletionPendingBody =
    await deletionPending.json() as Record<string, unknown>;
  assert(
    deletionPending.status === 202 &&
      deletionPendingBody.receiptId === ids[4] &&
      deletionPendingBody.outcome === 'committed_reconciliation_pending' &&
      !('deletionClaim' in deletionPendingBody),
    'deletion guard rejection after resolution commit is receipt-preserving pending work',
  );
  let preCommitCalls = 0;
  const beforeCommit = await handleStudioPrivateArtifactCommand(request(), {
    ...dependencies,
    executeAtomicCommand: async () => {
      preCommitCalls += 1;
      throw new Error('no authoritative commit');
    },
  });
  const beforeCommitBody = await beforeCommit.json() as Record<string, unknown>;
  assert(
    preCommitCalls === 2 &&
      beforeCommit.status === 503 &&
      beforeCommitBody.outcome === 'failed_before_commit' &&
      !('receiptId' in beforeCommitBody),
    'failure before any authoritative commit remains failed_before_commit',
  );
  console.log(
    'studio private artifact command: 78 schema, authority, classification, outcome-preservation, replay, side-effect, and non-disclosure scenarios passed',
  );
})().catch(error => {
  console.error(error);
  throw error;
});

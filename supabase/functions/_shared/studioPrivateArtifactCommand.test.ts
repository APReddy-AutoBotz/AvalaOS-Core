import {
  parseStudioPrivateArtifactEnvelope,
  parseStudioPrivateArtifactSqlCommand,
  StudioPrivateArtifactError,
  toStudioPrivateArtifactSqlCommand,
} from './studioPrivateArtifactCommand.ts';
import { handleStudioPrivateArtifactCommand } from './studioPrivateArtifactHandler.ts';

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

const request = (body = base) =>
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
  assert(leak.status === 503, 'private storage coordinates fail closed');
  const missingClaim = await handleStudioPrivateArtifactCommand(request(), {
    ...dependencies,
    executeAtomicCommand: async () => {
      const { renditionClaim: _claim, ...withoutClaim } = committed;
      return withoutClaim;
    },
  });
  assert(
    missingClaim.status === 503,
    'external-effect command cannot report committed without executable claim',
  );
  console.log(
    'studio private artifact command: 45 schema, authority, replay, side-effect, and non-disclosure scenarios passed',
  );
})().catch(error => {
  console.error(error);
  throw error;
});

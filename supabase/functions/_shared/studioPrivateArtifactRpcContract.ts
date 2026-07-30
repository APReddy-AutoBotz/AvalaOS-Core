import type {
  StudioPrivateArtifactAtomicResult,
  StudioPrivateArtifactAuthority,
  StudioPrivateArtifactJson,
} from './studioPrivateArtifactCommand.ts';
import { StudioPrivateArtifactError } from './studioPrivateArtifactCommand.ts';

export const STUDIO_PRIVATE_ARTIFACT_RENDERER_VERSIONS = {
  markdown: 'studio-markdown-1',
  pdf: 'studio-pdf-1',
  docx: 'studio-docx-1',
} as const;

export type StudioPrivateArtifactFormat =
  keyof typeof STUDIO_PRIVATE_ARTIFACT_RENDERER_VERSIONS;
export type StudioPrivateArtifactRendererVersion =
  (typeof STUDIO_PRIVATE_ARTIFACT_RENDERER_VERSIONS)[StudioPrivateArtifactFormat];
export type StudioPrivateArtifactType = 'brd' | 'frd' | 'pdd';
export type StudioPrivateArtifactMimeType =
  | 'text/markdown; charset=utf-8'
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export type StudioApprovedJson =
  | null
  | boolean
  | number
  | string
  | readonly StudioApprovedJson[]
  | Readonly<{ [key: string]: StudioApprovedJson }>;
export type StudioApprovedContent = Readonly<{ [key: string]: StudioApprovedJson }>;

export type StudioRenditionExecuteClaim = Readonly<{
  disposition: 'execute';
  requestId: string;
  attemptId: string;
  renditionId: string;
  organizationId: string;
  workspaceId: string;
  opaqueObjectId: string;
  artifactId: string;
  artifactVersionId: string;
  artifactType: StudioPrivateArtifactType;
  format: StudioPrivateArtifactFormat;
  approvedContent: StudioApprovedContent;
  contentSchemaVersion: string;
  rendererVersion: StudioPrivateArtifactRendererVersion;
  templateVersion: string;
  reconciliationCount: number;
}>;

export type StudioDeletionExecuteClaim = Readonly<{
  disposition: 'execute';
  requestId: string;
  deletionAttemptId: string;
  renditionId: string;
  organizationId: string;
  workspaceId: string;
  objectKey: string;
  reconciliationCount: number;
}>;

export type StudioDownloadExecuteClaim = Readonly<{
  organizationId: string;
  workspaceId: string;
  renditionId: string;
  objectKey: string;
  byteLength: number;
  sha256: string;
  mimeType: StudioPrivateArtifactMimeType;
  filename: string;
}>;

export type StudioRenditionLifecycleReceipt = Readonly<{
  outcome: 'committed' | 'replayed';
  attemptId?: string;
  renditionId?: string;
  state: string;
}>;

export type StudioDownloadRpcClaimResult = Readonly<{
  outcome: 'committed' | 'replayed';
  receiptId: string;
  resourceId: string;
  resource: StudioPrivateArtifactJson;
  downloadClaim: StudioDownloadExecuteClaim;
}>;

export type StudioDownloadLifecycleReceipt = Readonly<{
  outcome: 'committed' | 'replayed';
  receiptId: string;
  status: 'completed' | 'failed';
}>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/u;
const FAILURE = /^[A-Z0-9_]{1,64}$/u;
const OBJECT_KEY =
  /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/studio-artifacts\/[0-9a-f-]{36}\.(?:md|pdf|docx)$/iu;
const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u;
const MAX_APPROVED_CONTENT_BYTES = 500_000;
const MAX_APPROVED_DEPTH = 20;
const MAX_COLLECTION_ITEMS = 2_000;
const encoder = new TextEncoder();

const unavailable = (): never => {
  throw new StudioPrivateArtifactError('COMMAND_UNAVAILABLE');
};
const downloadUnavailable = (): never => {
  throw new StudioPrivateArtifactError('DOWNLOAD_UNAVAILABLE');
};
const record = (value: unknown): StudioPrivateArtifactJson =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as StudioPrivateArtifactJson)
    : unavailable();
const exact = (value: StudioPrivateArtifactJson, keys: readonly string[]) => {
  const actual = Object.keys(value);
  if (
    actual.length !== keys.length ||
    keys.some(key => !(key in value)) ||
    actual.some(key => !keys.includes(key))
  ) {
    unavailable();
  }
};
const uuid = (value: unknown) =>
  typeof value === 'string' && UUID.test(value) ? value : unavailable();
const nonNegativeInteger = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : unavailable();
const positiveInteger = (value: unknown) => {
  const candidate = nonNegativeInteger(value);
  return candidate > 0 ? candidate : unavailable();
};
const boundedText = (value: unknown, maximum = 200) =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= maximum
    ? value
    : unavailable();
const outcome = (value: unknown) =>
  value === 'committed' || value === 'replayed' ? value : unavailable();
const artifactType = (value: unknown): StudioPrivateArtifactType =>
  value === 'brd' || value === 'frd' || value === 'pdd'
    ? value
    : unavailable();
const format = (value: unknown): StudioPrivateArtifactFormat =>
  value === 'markdown' || value === 'pdf' || value === 'docx'
    ? value
    : unavailable();
const mimeType = (value: unknown): StudioPrivateArtifactMimeType =>
  value === 'text/markdown; charset=utf-8' ||
  value === 'application/pdf' ||
  value ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ? value
    : downloadUnavailable();
const rendererVersion = (
  value: unknown,
  expectedFormat?: StudioPrivateArtifactFormat,
): StudioPrivateArtifactRendererVersion => {
  if (
    typeof value !== 'string' ||
    !Object.values(STUDIO_PRIVATE_ARTIFACT_RENDERER_VERSIONS).includes(
      value as StudioPrivateArtifactRendererVersion,
    )
  ) {
    unavailable();
  }
  if (
    expectedFormat &&
    value !== STUDIO_PRIVATE_ARTIFACT_RENDERER_VERSIONS[expectedFormat]
  ) {
    unavailable();
  }
  return value as StudioPrivateArtifactRendererVersion;
};

const validateApprovedJson = (
  value: unknown,
  depth: number,
): StudioApprovedJson => {
  if (depth > MAX_APPROVED_DEPTH) unavailable();
  if (value === null) return null;
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : unavailable();
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_COLLECTION_ITEMS) unavailable();
    return value.map(item => validateApprovedJson(item, depth + 1));
  }
  if (typeof value !== 'object') unavailable();
  const entries = Object.entries(value);
  if (entries.length > MAX_COLLECTION_ITEMS) unavailable();
  const result: Record<string, StudioApprovedJson> = {};
  for (const [key, child] of entries) {
    if (
      key.length === 0 ||
      key.length > 200 ||
      key === '__proto__' ||
      key === 'constructor' ||
      key === 'prototype'
    ) {
      unavailable();
    }
    result[key] = validateApprovedJson(child, depth + 1);
  }
  return result;
};

export const decodeStudioApprovedContent = (
  value: unknown,
): StudioApprovedContent => {
  const decoded = validateApprovedJson(value, 0);
  if (decoded === null || Array.isArray(decoded) || typeof decoded !== 'object') {
    unavailable();
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(decoded);
  } catch {
    unavailable();
  }
  if (encoder.encode(serialized).byteLength > MAX_APPROVED_CONTENT_BYTES) {
    unavailable();
  }
  const content: Record<string, StudioApprovedJson> = {};
  for (const [key, child] of Object.entries(decoded)) content[key] = child;
  return content;
};

export const decodeStudioRenditionClaim = (
  value: unknown,
): StudioRenditionExecuteClaim => {
  const claim = record(value);
  exact(claim, [
    'disposition',
    'requestId',
    'attemptId',
    'renditionId',
    'organizationId',
    'workspaceId',
    'opaqueObjectId',
    'artifactId',
    'artifactVersionId',
    'artifactType',
    'format',
    'approvedContent',
    'contentSchemaVersion',
    'rendererVersion',
    'templateVersion',
    'reconciliationCount',
  ]);
  if (claim.disposition !== 'execute') unavailable();
  const decodedFormat = format(claim.format);
  return {
    disposition: 'execute',
    requestId: uuid(claim.requestId),
    attemptId: uuid(claim.attemptId),
    renditionId: uuid(claim.renditionId),
    organizationId: uuid(claim.organizationId),
    workspaceId: uuid(claim.workspaceId),
    opaqueObjectId: uuid(claim.opaqueObjectId),
    artifactId: uuid(claim.artifactId),
    artifactVersionId: uuid(claim.artifactVersionId),
    artifactType: artifactType(claim.artifactType),
    format: decodedFormat,
    approvedContent: decodeStudioApprovedContent(claim.approvedContent),
    contentSchemaVersion: boundedText(claim.contentSchemaVersion),
    rendererVersion: rendererVersion(claim.rendererVersion, decodedFormat),
    templateVersion: boundedText(claim.templateVersion),
    reconciliationCount: nonNegativeInteger(claim.reconciliationCount),
  };
};

export const decodeStudioDeletionClaim = (
  value: unknown,
): StudioDeletionExecuteClaim => {
  const claim = record(value);
  exact(claim, [
    'disposition',
    'requestId',
    'deletionAttemptId',
    'renditionId',
    'organizationId',
    'workspaceId',
    'objectKey',
    'reconciliationCount',
  ]);
  if (claim.disposition !== 'execute') unavailable();
  const objectKey = boundedText(claim.objectKey, 500);
  if (!OBJECT_KEY.test(objectKey)) unavailable();
  return {
    disposition: 'execute',
    requestId: uuid(claim.requestId),
    deletionAttemptId: uuid(claim.deletionAttemptId),
    renditionId: uuid(claim.renditionId),
    organizationId: uuid(claim.organizationId),
    workspaceId: uuid(claim.workspaceId),
    objectKey,
    reconciliationCount: nonNegativeInteger(claim.reconciliationCount),
  };
};

export const decodeStudioDownloadClaim = (
  value: unknown,
): StudioDownloadExecuteClaim => {
  try {
    const claim = record(value);
    exact(claim, [
      'organizationId',
      'workspaceId',
      'renditionId',
      'objectKey',
      'byteLength',
      'sha256',
      'mimeType',
      'filename',
    ]);
    const objectKey = boundedText(claim.objectKey, 500);
    const sha256 = boundedText(claim.sha256, 64);
    const filename = boundedText(claim.filename, 120);
    if (
      !OBJECT_KEY.test(objectKey) ||
      !HASH.test(sha256) ||
      !SAFE_FILENAME.test(filename)
    ) {
      downloadUnavailable();
    }
    return {
      organizationId: uuid(claim.organizationId),
      workspaceId: uuid(claim.workspaceId),
      renditionId: uuid(claim.renditionId),
      objectKey,
      byteLength: positiveInteger(claim.byteLength),
      sha256,
      mimeType: mimeType(claim.mimeType),
      filename,
    };
  } catch {
    downloadUnavailable();
  }
};

const FORBIDDEN_PUBLIC_KEYS = new Set([
  'bucket',
  'bucketid',
  'bucketname',
  'objectkey',
  'objectpath',
  'storagepath',
  'signedurl',
  'servicekey',
  'servicerole',
  'renditionclaim',
  'deletionclaim',
  'downloadclaim',
]);
const decodePublicJson = (
  value: unknown,
  depth = 0,
): StudioPrivateArtifactJson => {
  if (
    depth > 10 ||
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    unavailable();
  }
  const decoded: StudioPrivateArtifactJson = {};
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_PUBLIC_KEYS.has(key.toLowerCase().replace(/[_-]/gu, ''))) {
      unavailable();
    }
    if (Array.isArray(child)) {
      decoded[key] = child.map(item =>
        typeof item === 'object' && item !== null
          ? decodePublicJson(item, depth + 1)
          : item,
      );
    } else if (typeof child === 'object' && child !== null) {
      decoded[key] = decodePublicJson(child, depth + 1);
    } else {
      decoded[key] = child;
    }
  }
  return decoded;
};

export const decodeStudioAuthority = (
  value: unknown,
): StudioPrivateArtifactAuthority | null => {
  if (value === null) return null;
  const authority = record(value);
  exact(authority, [
    'actorId',
    'organizationId',
    'workspaceId',
    'authorizationVersion',
    'capabilities',
  ]);
  const capabilities = authority.capabilities;
  if (!Array.isArray(capabilities)) return unavailable();
  const decodedCapabilities = capabilities.map(capability =>
    boundedText(capability),
  );
  return {
    actorId: uuid(authority.actorId),
    organizationId: uuid(authority.organizationId),
    workspaceId: uuid(authority.workspaceId),
    authorizationVersion: positiveInteger(authority.authorizationVersion),
    capabilities: decodedCapabilities,
  };
};

export const decodeStudioAtomicResult = (
  value: unknown,
): StudioPrivateArtifactAtomicResult => {
  const result = record(value);
  const allowed = [
    'outcome',
    'receiptId',
    'resourceId',
    'resource',
    'renditionClaim',
    'deletionClaim',
  ];
  if (
    Object.keys(result).some(key => !allowed.includes(key)) ||
    !['outcome', 'receiptId', 'resourceId', 'resource'].every(key => key in result)
  ) {
    unavailable();
  }
  const decodedOutcome = outcome(result.outcome);
  if (
    decodedOutcome === 'replayed' &&
    ('renditionClaim' in result || 'deletionClaim' in result)
  ) {
    unavailable();
  }
  if ('renditionClaim' in result && 'deletionClaim' in result) unavailable();
  return {
    outcome: decodedOutcome,
    receiptId: uuid(result.receiptId),
    resourceId: uuid(result.resourceId),
    resource: decodePublicJson(result.resource),
    ...('renditionClaim' in result
      ? { renditionClaim: decodeStudioRenditionClaim(result.renditionClaim) }
      : {}),
    ...('deletionClaim' in result
      ? { deletionClaim: decodeStudioDeletionClaim(result.deletionClaim) }
      : {}),
  };
};

const decodeAttemptReceipt = (
  value: unknown,
): StudioRenditionLifecycleReceipt => {
  const receipt = record(value);
  const identifier =
    'attemptId' in receipt
      ? 'attemptId'
      : 'renditionId' in receipt
        ? 'renditionId'
        : unavailable();
  exact(receipt, ['outcome', identifier, 'state']);
  return {
    outcome: outcome(receipt.outcome),
    [identifier]: uuid(receipt[identifier]),
    state: boundedText(receipt.state, 64),
  };
};

const decodeDownloadClaimResult = (
  value: unknown,
): StudioDownloadRpcClaimResult => {
  const result = record(value);
  exact(result, [
    'outcome',
    'receiptId',
    'resourceId',
    'resource',
    'downloadClaim',
  ]);
  return {
    outcome: outcome(result.outcome),
    receiptId: uuid(result.receiptId),
    resourceId: uuid(result.resourceId),
    resource: decodePublicJson(result.resource),
    downloadClaim: decodeStudioDownloadClaim(result.downloadClaim),
  };
};

const decodeDownloadLifecycle = (
  value: unknown,
): StudioDownloadLifecycleReceipt => {
  const receipt = record(value);
  exact(receipt, ['outcome', 'receiptId', 'status']);
  const status = receipt.status;
  if (status !== 'completed' && status !== 'failed') return unavailable();
  const decodedStatus: 'completed' | 'failed' = status;
  return {
    outcome: outcome(receipt.outcome),
    receiptId: uuid(receipt.receiptId),
    status: decodedStatus,
  };
};

const decodeProjection = (value: unknown) =>
  value === null ? null : decodePublicJson(value);

export const STUDIO_PRIVATE_ARTIFACT_RPC_MANIFEST = {
  authority: {
    functionName: 'studio_private_artifact_authority',
    parameterNames: ['p_actor', 'p_org', 'p_workspace'],
    decode: decodeStudioAuthority,
  },
  commandClaim: {
    functionName: 'studio_private_artifact_command_claim',
    parameterNames: ['p_command'],
    decode: decodeStudioAtomicResult,
  },
  renditionStart: {
    functionName: 'studio_rendition_attempt_start',
    parameterNames: ['p_attempt'],
    decode: decodeAttemptReceipt,
  },
  renditionRendered: {
    functionName: 'studio_rendition_attempt_rendered',
    parameterNames: [
      'p_attempt',
      'p_object_key',
      'p_hash',
      'p_byte_length',
      'p_mime',
      'p_safe_filename',
      'p_renderer_version',
      'p_template_version',
      'p_content_schema_version',
    ],
    decode: decodeAttemptReceipt,
  },
  renditionComplete: {
    functionName: 'studio_rendition_attempt_complete',
    parameterNames: ['p_attempt'],
    decode: decodeAttemptReceipt,
  },
  renditionFail: {
    functionName: 'studio_rendition_attempt_fail',
    parameterNames: ['p_attempt', 'p_failure'],
    decode: decodeAttemptReceipt,
  },
  deletionComplete: {
    functionName: 'studio_rendition_deletion_complete',
    parameterNames: ['p_attempt'],
    decode: decodeAttemptReceipt,
  },
  deletionFail: {
    functionName: 'studio_rendition_deletion_fail',
    parameterNames: ['p_attempt', 'p_failure'],
    decode: decodeAttemptReceipt,
  },
  downloadClaim: {
    functionName: 'studio_artifact_download_claim',
    parameterNames: ['p_command'],
    decode: decodeDownloadClaimResult,
  },
  downloadComplete: {
    functionName: 'studio_artifact_download_complete',
    parameterNames: ['p_receipt'],
    decode: decodeDownloadLifecycle,
  },
  downloadFail: {
    functionName: 'studio_artifact_download_fail',
    parameterNames: ['p_receipt', 'p_failure'],
    decode: decodeDownloadLifecycle,
  },
  projection: {
    functionName: 'studio_private_artifact_projection',
    parameterNames: ['p_org', 'p_workspace', 'p_artifact_version'],
    decode: decodeProjection,
  },
} as const;

export type StudioPrivateArtifactRpcKey =
  keyof typeof STUDIO_PRIVATE_ARTIFACT_RPC_MANIFEST;

export interface StudioPrivateArtifactRpcArgs {
  authority: {
    p_actor: string;
    p_org: string;
    p_workspace: string;
  };
  commandClaim: { p_command: unknown };
  renditionStart: { p_attempt: string };
  renditionRendered: {
    p_attempt: string;
    p_object_key: string;
    p_hash: string;
    p_byte_length: number;
    p_mime: string;
    p_safe_filename: string;
    p_renderer_version: StudioPrivateArtifactRendererVersion;
    p_template_version: string;
    p_content_schema_version: string;
  };
  renditionComplete: { p_attempt: string };
  renditionFail: { p_attempt: string; p_failure: string };
  deletionComplete: { p_attempt: string };
  deletionFail: { p_attempt: string; p_failure: string };
  downloadClaim: { p_command: unknown };
  downloadComplete: { p_receipt: string };
  downloadFail: { p_receipt: string; p_failure: string };
  projection: {
    p_org: string;
    p_workspace: string;
    p_artifact_version: string;
  };
}

export interface StudioPrivateArtifactRpcResults {
  authority: StudioPrivateArtifactAuthority | null;
  commandClaim: StudioPrivateArtifactAtomicResult;
  renditionStart: StudioRenditionLifecycleReceipt;
  renditionRendered: StudioRenditionLifecycleReceipt;
  renditionComplete: StudioRenditionLifecycleReceipt;
  renditionFail: StudioRenditionLifecycleReceipt;
  deletionComplete: StudioRenditionLifecycleReceipt;
  deletionFail: StudioRenditionLifecycleReceipt;
  downloadClaim: StudioDownloadRpcClaimResult;
  downloadComplete: StudioDownloadLifecycleReceipt;
  downloadFail: StudioDownloadLifecycleReceipt;
  projection: StudioPrivateArtifactJson | null;
}

export const assertStudioPrivateArtifactRpcArgs = <
  Key extends StudioPrivateArtifactRpcKey,
>(
  key: Key,
  args: StudioPrivateArtifactRpcArgs[Key],
) => {
  const expected = STUDIO_PRIVATE_ARTIFACT_RPC_MANIFEST[key].parameterNames;
  const actual = Object.keys(args);
  if (
    actual.length !== expected.length ||
    expected.some(parameter => !(parameter in args)) ||
    actual.some(parameter => !(expected as readonly string[]).includes(parameter))
  ) {
    unavailable();
  }
};

export const decodeStudioPrivateArtifactRpcResult = <
  Key extends StudioPrivateArtifactRpcKey,
>(
  key: Key,
  value: unknown,
): StudioPrivateArtifactRpcResults[Key] =>
  STUDIO_PRIVATE_ARTIFACT_RPC_MANIFEST[key].decode(value) as StudioPrivateArtifactRpcResults[Key];

export const isStudioPrivateArtifactFailureCode = (value: unknown) =>
  typeof value === 'string' && FAILURE.test(value);

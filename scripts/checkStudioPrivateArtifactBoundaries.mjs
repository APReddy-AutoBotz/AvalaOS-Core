import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const root = resolve('.');
const canonicalFiles = [
  'services/studioArtifacts/privateArtifactContracts.ts',
  'services/studioArtifacts/privateArtifactClient.ts',
  'components/docs/StudioArtifactRenditions.tsx',
  'supabase/functions/_shared/studioPrivateArtifactCommand.ts',
  'supabase/functions/_shared/studioPrivateArtifactHandler.ts',
  'supabase/functions/_shared/studioPrivateArtifactDb.ts',
  'supabase/functions/_shared/studioPrivateArtifactDownloadHandler.ts',
  'supabase/functions/_shared/studioPrivateArtifactRenderer.ts',
  'supabase/functions/_shared/storageBoundary.ts',
  'supabase/functions/_shared/studioPrivateArtifactStorage.ts',
  'supabase/functions/_shared/studioPrivateArtifactSaga.ts',
  'supabase/functions/_shared/studioPrivateArtifactReconciliationHandler.ts',
  'supabase/functions/studio-private-artifact-command/index.ts',
  'supabase/functions/studio-private-artifact-reconcile/index.ts',
  'supabase/functions/studio-artifact-download/index.ts',
  'components/docs/StudioArtifactWorkspace.tsx',
];
const sources = new Map(
  await Promise.all(
    canonicalFiles.map(async file => [file, await readFile(file, 'utf8')]),
  ),
);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browserFiles = [
  'services/studioArtifacts/privateArtifactClient.ts',
  'components/docs/StudioArtifactRenditions.tsx',
];
for (const file of browserFiles) {
  const source = sources.get(file);
  for (const [label, pattern] of [
    ['direct Storage client', /\bstorage\s*\.\s*from\s*\(/u],
    ['browser upload', /\bstorage\s*\.\s*from\s*\([^)]*\)\s*\.\s*upload\s*\(/u],
    ['browser remove', /\bstorage\s*\.\s*from\s*\([^)]*\)\s*\.\s*remove\s*\(/u],
    ['browser bucket list', /\bstorage\s*\.\s*from\s*\([^)]*\)\s*\.\s*list\s*\(/u],
    ['browser signed URL creation', /createSignedUrl/iu],
    ['public object URL', /getPublicUrl|publicURL/iu],
    ['service-role material', /service[_-]?role|SERVICE_ROLE_KEY/iu],
    ['legacy export promotion', /exportDocument|artifactExportHelper/iu],
  ]) {
    assert(!pattern.test(source), `${file}: forbidden ${label}`);
  }
}

for (const file of canonicalFiles) {
  const source = sources.get(file);
  assert(
    !/createSignedUrl|getPublicUrl|\bsignedUrl\s*:/u.test(source),
    `${file}: canonical PR B may not issue or expose a signed/public URL`,
  );
}

const contracts = sources.get('services/studioArtifacts/privateArtifactContracts.ts');
for (const token of [
  "name: 'studio_private_artifact_projection'",
  "argumentKeys: ['p_org', 'p_workspace', 'p_artifact_version']",
  "'reconciliation_required'",
  "'reconciling'",
  "'deletion_reconciliation_required'",
  "'deletion_reconciling'",
  'activeHolds',
  'holdId: string',
]) assert(contracts.includes(token), `public projection contract missing: ${token}`);
const commandPayloadSection = contracts.slice(
  contracts.indexOf('export interface StudioPrivateArtifactCommandPayloads'),
  contracts.indexOf('export interface StudioPrivateArtifactCommandEnvelope'),
);
for (const field of [
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
]) {
  assert(
    !new RegExp(`\\b${field}\\b`, 'u').test(commandPayloadSection),
    `browser command payload exposes forbidden ${field} authority`,
  );
}

const command = sources.get(
  'supabase/functions/_shared/studioPrivateArtifactCommand.ts',
);
for (const commandType of [
  'studio.rendition.generate',
  'studio.retention.policy.publish',
  'studio.rendition.retention.extend',
  'studio.legal_hold.place',
  'studio.legal_hold.release',
  'studio.rendition.deletion.request',
  'studio.rendition.deletion.resolve',
]) {
  assert(command.includes(commandType), `missing strict command: ${commandType}`);
}
for (const capability of [
  'studio.artifacts.rendition.generate',
  'studio.artifacts.download',
  'studio.artifacts.retention.manage',
  'studio.artifacts.legal_hold.manage',
  'studio.artifacts.delete.request',
  'studio.artifacts.delete.approve',
]) {
  assert(
    sources.get('services/studioArtifacts/privateArtifactContracts.ts').includes(capability) &&
      (command.includes(capability) ||
        sources
          .get('supabase/functions/_shared/studioPrivateArtifactDownloadHandler.ts')
          .includes(capability)),
    `missing narrow capability: ${capability}`,
  );
}

const handler = sources.get('supabase/functions/_shared/studioPrivateArtifactHandler.ts');
assert(
  handler.indexOf('loadFreshAuthority') < handler.indexOf('executeAtomicCommand'),
  'fresh command authority must precede receipt/resource inspection',
);
assert(
  handler.indexOf("result.outcome === 'replayed'") <
    handler.indexOf('const external = await deps.executeClaimedRendition'),
  'exact command replay must precede every external effect',
);
assert(
  handler.includes("throw new StudioPrivateArtifactError('COMMAND_UNAVAILABLE')"),
  'missing executable side-effect claim must fail closed',
);
assert(
  handler.includes('toStudioPrivateArtifactSqlCommand(envelope, actor.id)') &&
    !handler.includes('{ ...envelope, actorId: actor.id }'),
  'public payload must pass through the exact public-to-SQL translator',
);
for (const token of [
  "'committed_reconciliation_pending'",
  'receiptId: result.receiptId',
  'resourceId: result.resourceId',
  'recoveredAfterTransportFailure',
  'committedPublicResource',
]) assert(handler.includes(token), `truthful post-commit boundary missing: ${token}`);
assert(
  handler.indexOf('if (committed)') < handler.indexOf('studioPrivateArtifactErrorBody(safe)'),
  'post-commit exceptions must not map to failed_before_commit',
);
for (const token of [
  'parseStudioPrivateArtifactSqlCommand',
  'toStudioPrivateArtifactSqlCommand',
  'extendUntil',
  'retentionUntil',
  'rationale',
  'holdId',
]) assert(command.includes(token), `command translator contract missing: ${token}`);

const download = sources.get(
  'supabase/functions/_shared/studioPrivateArtifactDownloadHandler.ts',
);
for (const token of [
  'loadFreshAuthority',
  'studio.artifacts.download',
  'claimDownload',
  'retrieveAndVerify',
  'completeDownload',
  'failDownload',
  "'Cache-Control': 'private, no-store'",
  "'X-Content-Type-Options': 'nosniff'",
  "'Access-Control-Expose-Headers'",
  "'Content-Disposition'",
]) {
  assert(download.includes(token), `download broker contract missing: ${token}`);
}
assert(
  download.indexOf('loadFreshAuthority') < download.indexOf('claimDownload'),
  'fresh download authority must precede receipt/rendition inspection',
);
assert(
  download.indexOf('completeDownload(receiptId)') <
    download.indexOf('return new Response(download.bytes'),
  'download may return bytes only after durable receipt completion',
);

const storage = sources.get(
  'supabase/functions/_shared/studioPrivateArtifactStorage.ts',
);
for (const token of ["'x-upsert': 'false'", 'uploadCreateOnly', 'probeExact', 'deleteExact']) {
  assert(storage.includes(token), `private storage contract missing: ${token}`);
}
const storageBoundary = sources.get('supabase/functions/_shared/storageBoundary.ts');
assert(storageBoundary.includes("STUDIO_PRIVATE_ARTIFACTS_BUCKET = 'studio-private-artifacts'"), 'canonical Studio bucket constant missing');
assert(storageBoundary.includes('configuredAllowlist !== STUDIO_PRIVATE_ARTIFACTS_BUCKET'), 'Studio allowlist must be exactly canonical');
assert(!storageBoundary.includes('studio-private-archive'), 'alternate Studio bucket leaked into production authority');
const database = sources.get('supabase/functions/_shared/studioPrivateArtifactDb.ts');
assert(database.includes('reconcileStudioPrivateRendition') && database.includes('reconcileStudioPrivateDeletion'), 'production reconciliation operations missing');
assert(!/load(?:Deletion)?Reconciliation:\s*async\s*\(\)\s*=>\s*null/u.test(database), 'production reconciliation loader remains unwired');
assert(
  database.indexOf("rpc('deletionExecutionClaim'") <
    database.indexOf('const result = await executeStudioDeletionSaga'),
  'deletion execution claim must be wired before provider-effect saga execution',
);
for (const token of [
  "rpc('renditionReconciliationRendered'",
  "rpc('renditionReconciliationComplete'",
  "rpc('renditionReconciliationFail'",
  "rpc('reconciliationDue'",
]) assert(database.includes(token), `fenced recovery adapter missing: ${token}`);
const worker = sources.get('supabase/functions/_shared/studioPrivateArtifactReconciliationHandler.ts');
for (const token of ['x-avala-studio-worker-secret', "request.method !== 'POST'", "request.headers.has('authorization')", "request.headers.has('origin')", "status: 'unavailable'"]) assert(worker.includes(token), 'worker boundary missing: ' + token);
const workerEndpoint = sources.get('supabase/functions/studio-private-artifact-reconcile/index.ts');
assert(workerEndpoint.includes('STUDIO_PRIVATE_ARTIFACT_RECONCILIATION_WORKER_SECRET'), 'worker secret config missing');
assert(workerEndpoint.includes("pathname.endsWith('/due')"), 'bounded due-work endpoint missing');
const supabaseConfig = await readFile('supabase/config.toml', 'utf8');
assert(/\[functions\.studio-private-artifact-reconcile\][\s\S]*verify_jwt = false/u.test(supabaseConfig), 'custom-auth worker function config missing');
const saga = sources.get('supabase/functions/_shared/studioPrivateArtifactSaga.ts');
for (const token of [
  'executeStudioRenditionSaga',
  'executeStudioDeletionSaga',
  "claim.disposition === 'replay'",
  'markAvailable',
  'markTombstone',
]) {
  assert(saga.includes(token), `side-effect saga contract missing: ${token}`);
}

const ui = sources.get('components/docs/StudioArtifactRenditions.tsx');
for (const misleading of [
  'successfully requested',
  'deletion complete once requested',
  'download ready before',
]) {
  assert(!ui.toLowerCase().includes(misleading), `false-success UI wording: ${misleading}`);
}
assert(
  ui.includes("rendition.state !== 'available'") &&
    ui.includes("panelState === 'committed_reload_failed'"),
  'UI must gate downloads and mutations on committed state',
);
for (const token of [
  "'deletion_reconciliation_required'",
  "'deletion_reconciling'",
  "'Request deletion again'",
  'immutable deleted tombstone',
  'new approved artifact version',
]) assert(ui.includes(token), `UI lifecycle guard missing: ${token}`);
assert(
  !ui.includes("!['failed', 'deleted'].includes(rendition.state)"),
  'deleted tombstones must never expose generation',
);

const migrationPath =
  'supabase/migrations/20260729163251_studio_private_artifact_authority.sql';
const migration = await readFile(migrationPath, 'utf8');
if (migration.trim()) {
  assert(
    !/\bdelete\s+from\s+(?:public\.)?studio_(?:private_)?artifact_renditions\b/iu.test(
      migration,
    ),
    'canonical rendition metadata may not be hard deleted',
  );
  assert(!migration.includes('studio-private-archive'), 'alternate Studio bucket may not enter migration authority');
  assert(
    !/\bpublic\s*=\s*true\b/iu.test(migration),
    'Studio private artifact bucket may not be public',
  );
}

const walk = async directory => {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (
      entry.name === '.git' ||
      entry.name === 'node_modules' ||
      entry.name === 'dist' ||
      entry.name === '.temp'
    ) continue;
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await walk(absolute)));
    else if (/\.(?:ts|tsx|js|mjs|sql)$/u.test(entry.name)) output.push(absolute);
  }
  return output;
};
let classifiedLegacyHits = 0;
for (const absolute of await walk(root)) {
  const file = relative(root, absolute).replaceAll('\\', '/');
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file)) continue;
  const source = await readFile(absolute, 'utf8');
  if (
    /\bstorage\s*\.\s*from\s*\([^)]*\)\s*\.\s*(?:upload|remove|list)\s*\(/u.test(
      source,
    ) ||
    /createSignedUrl|getPublicUrl/iu.test(source)
  ) {
    assert(
      !file.includes('studioArtifacts/privateArtifact') &&
        !file.includes('StudioArtifactRenditions') &&
        !file.includes('studioPrivateArtifact') &&
        !file.includes('studio-private-artifact') &&
        !file.includes('studio-artifact-download'),
      `${file}: legacy Storage helper promoted into canonical PR B path`,
    );
    classifiedLegacyHits += 1;
  }
}

const workflow = await readFile('.github/workflows/studio-governed-artifacts.yml', 'utf8');
for (const job of [
  'studio-private-artifacts-source:',
  'studio-private-artifacts-renderers:',
  'studio-private-artifacts-postgresql-16:',
  'studio-private-artifacts-browser:',
]) {
  assert(workflow.includes(job), `Studio PR B workflow job missing: ${job}`);
}
for (const evidence of [
  'tee studio-private-renderers.log',
  'tee studio-private-postgresql-16.log',
  'if: always()',
  'actions/upload-artifact@v4',
]) {
  assert(workflow.includes(evidence), `Studio PR B CI evidence contract missing: ${evidence}`);
}
console.log(
  `Studio private-artifact boundaries passed: ${canonicalFiles.length} canonical files, 6 capabilities, 7 commands, ${classifiedLegacyHits} legacy-only helper files classified outside PR B.`,
);

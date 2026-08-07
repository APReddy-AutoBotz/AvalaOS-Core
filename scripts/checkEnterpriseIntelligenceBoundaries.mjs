import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'services/enterpriseIntelligence.ts',
  'services/enterpriseIntelligenceClient.ts',
  'components/enterprise/EnterpriseIntelligenceView.tsx',
  'supabase/functions/_shared/enterpriseIntelligenceAi.ts',
  'supabase/functions/_shared/enterpriseIntelligenceCommand.ts',
  'supabase/functions/_shared/enterpriseIntelligenceQuery.ts',
  'supabase/functions/_shared/enterpriseReceipt.ts',
  'supabase/functions/_shared/providerLifecycle.ts',
  'supabase/functions/_shared/providerLifecycleEndpoint.ts',
  'supabase/functions/enterprise-intelligence-command/index.ts',
  'supabase/functions/enterprise-intelligence-query/index.ts',
  'supabase/functions/enterprise-provider-lifecycle/index.ts',
  'supabase/functions/enterprise-provider-lifecycle-authority/index.ts',
  'supabase/functions/enterprise-provider-lifecycle-recovery/index.ts',
  'supabase/migrations/20260804120000_enterprise_intelligence_authority.sql',
  'supabase/migrations/20260805120000_provider_lifecycle_authorization_attempts.sql',
  'supabase/migrations/20260805140000_enterprise_intelligence_ready_review_corrections.sql',
  'supabase/migrations/20260805150000_enterprise_atomic_candidate_promotion.sql',
  'supabase/migrations/20260805160000_enterprise_rpc_error_and_extraction_recovery.sql',
  'supabase/migrations/20260807120000_enterprise_review_action_replay_authority.sql',
  'supabase/migrations/20260807130000_provider_secret_cleanup_recovery.sql',
];

const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const missing = requiredFiles.filter(relativePath => !fs.existsSync(path.join(root, relativePath)));
if (missing.length) throw new Error(`Missing Enterprise Intelligence files: ${missing.join(', ')}`);

const featureText = requiredFiles.map(read).join('\n');
const forbidden = [
  /VITE_(?:GEMINI|GROQ)_API_KEY/i,
  /StorageKeys\.API_KEY/,
  /localStorage/,
  /new\s+(?:Gemini|Groq)Provider/,
  /fallbackProvider/,
  /Falling back/i,
];
const hits = forbidden.filter(pattern => pattern.test(featureText));
if (hits.length) throw new Error(`Enterprise Intelligence boundary scan failed: ${hits.map(String).join(', ')}`);

const command = read('supabase/functions/_shared/enterpriseIntelligenceCommand.ts');
const client = read('services/enterpriseIntelligenceClient.ts');
const view = read('components/enterprise/EnterpriseIntelligenceView.tsx');
const providerResolver = read('supabase/functions/_shared/providerResolver.ts');
const supabaseRpc = read('supabase/functions/_shared/supabase.ts');
for (const required of ['resolveOrgId', 'resolveAuthority', 'enterprise_claim_or_resume_evidence_extraction_job', 'runGovernedProviderRequest', 'RESOURCE_STALE', 'evidence.assess.promote', 'enterprise_promote_evidence_batch_to_assess_v2']) {
  if (!command.includes(required)) throw new Error(`Enterprise command boundary is missing ${required}.`);
}
if (/payload\.(?:sourceVersionId|assessmentVersionId|studioVersion|studioContentHash|packageVersionId|approvedItemIds)\b/u.test(command)) {
  throw new Error('Enterprise commands may not accept browser-supplied authoritative versions, hashes, or item identifiers.');
}
const approvalCommands = command.slice(
  command.indexOf('const approvalResourceTypes'),
  command.indexOf('type StudioAggregateRow'),
);
if (approvalCommands.includes('sha256Json') || approvalCommands.includes('resource_hash=eq.')) {
  throw new Error('Approval authority must not use an application-computed hash or an Edge hash-filtered review lookup.');
}
for (const required of [
  'enterprise_resolve_high_impact_review_authority',
  'enterprise_record_high_impact_review_v2',
  'enterprise_commit_high_impact_approval_v2',
]) {
  if (!approvalCommands.includes(required)) throw new Error(`Canonical approval command flow is missing ${required}.`);
}
if (client.includes('stableFingerprint(material)') || client.includes("subtle.digest('SHA-256'")) {
  throw new Error('Browser action idempotency keys must not be deterministic payload hashes.');
}
for (const pattern of [/localStorage/u, /sessionStorage/u, /indexedDB/u, /console\.(?:log|info|debug|warn|error)/u]) {
  if (pattern.test(`${client}\n${view}`)) {
    throw new Error(`Provider browser action code may not persist or log raw key material: ${pattern}.`);
  }
}
if (!client.includes('createEnterpriseActionIdempotencyKey(input.commandType)')
  || !client.includes('createEnterpriseActionIdempotencyKey(input.operation)')) {
  throw new Error('Both command surfaces require fresh cryptographic per-action keys.');
}
const providerLifecycleClient = client.slice(
  client.indexOf('const invokeProviderLifecycle'),
  client.indexOf('const loadProjection'),
);
for (const required of [
  'const requestId = createId()',
  'const idempotencyKey = createEnterpriseActionIdempotencyKey(input.operation)',
  'staleRecoveryAttempt <= 1',
  "errorCode !== 'AUTHORIZATION_STALE'",
  "'enterprise-provider-lifecycle-authority'",
  'recheckAttempt < 3',
  'isRetryableTransportError(authorityInvocation.error)',
  'waitForProviderAuthorityRetry',
  'authorityData.authorized',
  "'enterprise-provider-lifecycle-recovery'",
  'recoveryData.terminal === true',
  'expectedAuthorizationVersion = refreshedAuthorizationVersion',
  'activePayload.providerKey = undefined',
]) {
  if (!providerLifecycleClient.includes(required)) {
    throw new Error(`Provider browser stale-authority recovery is missing ${required}.`);
  }
}
if (providerLifecycleClient.includes("capabilities.includes('")
  || providerLifecycleClient.includes('loadProjection(')) {
  throw new Error('The browser must not infer lifecycle authority from a projected capability set.');
}
if (!(providerLifecycleClient.indexOf('const requestId = createId()') < providerLifecycleClient.indexOf('for (let staleRecoveryAttempt')
  && providerLifecycleClient.indexOf('const idempotencyKey = createEnterpriseActionIdempotencyKey(input.operation)') < providerLifecycleClient.indexOf('for (let staleRecoveryAttempt'))) {
  throw new Error('Provider stale-authority recovery must retain one request ID and idempotency key for the logical browser action.');
}
const providerLifecycleEndpoint = read('supabase/functions/_shared/providerLifecycleEndpoint.ts');
for (const required of [
  'parseProviderLifecycleAuthorityRecheckEnvelope',
  'authenticateProviderLifecycle(request, envelope, false)',
  'assertProviderLifecycleOperationAuthority(envelope.operation, authority)',
  "new Set(['operation', 'organizationId', 'workspaceId'])",
  "new Set(['operation', 'organizationId', 'workspaceId', 'providerConfigId', 'routeId'])",
  'return jsonResponse({ authorized: true, authorizationVersion: authority.authorizationVersion }, 200)',
]) {
  if (!providerLifecycleEndpoint.includes(required)) {
    throw new Error(`Provider authority recheck is missing ${required}.`);
  }
}
for (const required of [
  'parseProviderLifecycleRecoveryEnvelope',
  'enterprise_ai_claim_provider_secret_cleanup',
  'recoverProviderLifecycleManagedSecret',
  "new ProviderLifecycleError('PERMISSION_DENIED')",
  'assertProviderRecoveryTerminal',
]) {
  if (!providerLifecycleEndpoint.includes(required)) {
    throw new Error(`Provider raw-key-free cleanup recovery is missing ${required}.`);
  }
}
const recoveryParser = providerLifecycleEndpoint.slice(
  providerLifecycleEndpoint.indexOf('parseProviderLifecycleRecoveryEnvelope'),
  providerLifecycleEndpoint.indexOf('export const authenticateProviderLifecycle'),
);
for (const forbiddenSelector of ["'providerKey'", "'secretReference'", "'safeFingerprint'", "'executionFence'"]) {
  if (recoveryParser.includes(forbiddenSelector)) {
    throw new Error(`Provider cleanup recovery may not accept ${forbiddenSelector}.`);
  }
}
if (providerLifecycleEndpoint.slice(
  providerLifecycleEndpoint.indexOf('parseProviderLifecycleAuthorityRecheckEnvelope'),
  providerLifecycleEndpoint.indexOf('export const authenticateProviderLifecycle'),
).includes('providerKey')) {
  throw new Error('Provider authority recheck selectors may not accept raw provider keys.');
}
for (const operation of [
  'provider.register', 'provider.secret.bind', 'provider.validate', 'provider.activate',
  'provider.secret.rotate', 'provider.revoke', 'provider.route.toggle',
]) {
  if (!client.includes(`operation: '${operation}'`)) {
    throw new Error(`Provider lifecycle browser action is not routed through shared stale-authority recovery: ${operation}.`);
  }
}
for (const invocation of ['enterprise-intelligence-command', 'enterprise-provider-lifecycle']) {
  const start = client.indexOf(`supabase.functions.invoke('${invocation}'`);
  const retry = client.indexOf(`supabase.functions.invoke('${invocation}'`, start + 1);
  if (start < 0 || retry < 0 || !client.slice(start, retry + 120).includes('{ body }')) {
    throw new Error(`${invocation} transport retry must reuse the exact constructed body.`);
  }
}
if (!command.includes('requiredCapabilitiesForEnterpriseCommand')
  || !command.includes('assertCurrentEnterpriseCommandAuthority')) {
  throw new Error('Enterprise receipt replay requires one reusable operation-specific authority mapping.');
}
if (!command.includes('assertProviderLifecycleOperationAuthority(providerOperation, lifecycleAuthority(current))')
  || !command.includes('const enterpriseProviderOperations')) {
  throw new Error('Generic provider commands must use exact provider lifecycle authority.');
}
const claimIndex = command.indexOf('const { receipt, ownsExecution } = await (overrides.claimReceipt || claimEnterpriseReceipt)');
const authorityAlias = command.lastIndexOf(
  'const assertCurrentAuthority = overrides.assertCurrentAuthority || assertCurrentEnterpriseCommandAuthority',
  claimIndex,
);
const preclaimAuthority = command.lastIndexOf('await assertCurrentAuthority', claimIndex);
const committedReturn = command.indexOf("if (receipt.status === 'committed')", claimIndex);
const postclaimAuthority = command.indexOf('await assertCurrentAuthority', claimIndex);
if (!(authorityAlias >= 0 && authorityAlias < preclaimAuthority
  && preclaimAuthority >= 0 && preclaimAuthority < claimIndex
  && postclaimAuthority > claimIndex && postclaimAuthority < committedReturn)) {
  throw new Error('Current operation authority must be checked before claim and before terminal receipt disclosure.');
}
const enterpriseSuccessFinalization = command.slice(
  command.indexOf('const result = await executeCommand'),
  command.indexOf('} catch (error)', command.indexOf('const result = await executeCommand')),
);
if (!(enterpriseSuccessFinalization.indexOf('await assertCurrentAuthority')
  < enterpriseSuccessFinalization.indexOf('await completeReceipt')
  && enterpriseSuccessFinalization.lastIndexOf('await assertCurrentAuthority')
    > enterpriseSuccessFinalization.indexOf('await completeReceipt'))) {
  throw new Error('Enterprise success finalization requires current authority both before commit and before disclosure.');
}
const enterpriseFailureFinalization = command.slice(
  command.indexOf("if (claimedReceipt && claimedAuthority && claimedCommandType && commandError.code !== 'RECEIPT_FINALIZATION_FAILED')"),
  command.indexOf('export const handleEnterpriseIntelligenceOptions'),
);
if (!(enterpriseFailureFinalization.indexOf('await assertCurrentAuthority')
  < enterpriseFailureFinalization.indexOf('await failReceipt')
  && enterpriseFailureFinalization.lastIndexOf('await assertCurrentAuthority')
    > enterpriseFailureFinalization.indexOf('await failReceipt'))) {
  throw new Error('Enterprise failure finalization requires current authority both before commit and before disclosure.');
}
const enterpriseRecovery = command.slice(
  command.indexOf('if (claimedReceipt && claimedAuthority && claimedCommandType) {'),
  command.indexOf("if (claimedReceipt && claimedAuthority && claimedCommandType && commandError.code !== 'RECEIPT_FINALIZATION_FAILED')"),
);
if (!(enterpriseRecovery.indexOf('await assertCurrentAuthority') >= 0
  && enterpriseRecovery.indexOf('await assertCurrentAuthority') < enterpriseRecovery.indexOf('reloadEnterpriseReceipt')
  && enterpriseRecovery.lastIndexOf('await assertCurrentAuthority') > enterpriseRecovery.indexOf('reloadEnterpriseReceipt'))) {
  throw new Error('Enterprise effect recovery requires exact current authority before reconciliation and again before disclosure.');
}
if (!command.includes('enterpriseCommandStatusForTerminalReceipt(receipt)')
  || !command.includes('enterpriseCommandStatusForTerminalReceipt(recovered)')) {
  throw new Error('Enterprise terminal replay must derive HTTP status from the persisted stable product error.');
}
if (!command.includes("new RecoverableEnterpriseCommandError('AUTHORIZATION_STALE')")
  || !command.includes("error.code === 'AUTHORIZATION_STALE'")) {
  throw new Error('Authorization-stale Enterprise receipts must retain the recoverable claimed disposition.');
}

for (const pattern of [/placeholder=["'`]UUID/iu, /\b(?:studioContentHash|studioVersion|assessmentVersionId|packageVersionId|approvedItemIds|secretReference)\b/u]) {
  if (pattern.test(view)) throw new Error(`Enterprise UI exposes a raw authority input: ${pattern}.`);
}
for (const required of ['loadProjection', 'Reload committed state', 'projection reload failed', 'type="password"']) {
  if (!view.includes(required)) throw new Error(`Enterprise UI is missing reloadable projection behavior: ${required}.`);
}

const migration = read('supabase/migrations/20260804120000_enterprise_intelligence_authority.sql');
for (const required of ['FORCE ROW LEVEL SECURITY', 'enterprise_ai_command_receipts', 'enterprise_evidence_source_versions', 'enterprise_high_impact_approval_separation_check', 'live_telemetry_connected BOOLEAN NOT NULL DEFAULT false']) {
  if (!migration.includes(required)) throw new Error(`Enterprise migration invariant is missing ${required}.`);
}
const functionBodies = name => [...migration.matchAll(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`, 'g'))].map(match => match[0]);
const classifier = functionBodies('enterprise_command_runtime_area').at(-1) || '';
for (const commandType of [
  'provider.register', 'provider.secret.bind', 'provider.validate', 'provider.activate', 'provider.route.toggle', 'provider.secret.rotate', 'provider.revoke',
  'evidence.source.create', 'evidence.extract', 'evidence.candidate.review', 'evidence.assess.promote',
  'modernization.evaluate', 'studio.delivery.handoff', 'monitor.baseline.create',
  'approval.review.record', 'approval.record', 'assemble.blueprint.create',
]) {
  if (!classifier.includes(`'${commandType}'`)) throw new Error(`Runtime-area classifier is missing ${commandType}.`);
}
for (const name of ['enterprise_ai_complete_command', 'enterprise_ai_fail_command']) {
  if (functionBodies(name).some(body => body.includes('enterprise_asse×}5¶‰ËkºwµçU¥ÁÑI•½¹¥±¥…Ñ¥½¹ÕÑ¡½É¥é•Èœ¤(€€€€˜˜‰½‘ä¹¥¹‘•á=˜ …İ…¥Ğ…ÕÑ¡½É¥é•I•½¹¥±¥…Ñ¥½¸ ¤œ¤€ğ‰½‘ä¹¥¹‘•á=˜ É•½¹¥±•¹Ñ•ÉÁÉ¥Í•I••¥ÁĞ œ¤¤¤ì(€€€Ñ¡É½Ü¹•ÜÉÉ½È¡€‘í¡•±Á•ÉôµÕÍĞÉ•…ÕÑ¡½É¥é”‰•™½É”…¹ä•™™•Ğµ©½ÕÉ¹…°É•½¹¥±¥…Ñ¥½¸¹€¤ì(€ô)ô)½¹ÍĞÁÉ½Ù¥‘•ÉMÕ•ÍÍ¥¹…±¥é…Ñ¥½¸€ôÁÉ½Ù¥‘•É¹‘Á½¥¹Ğ¹Í±¥” (€ÁÉ½Ù¥‘•É¹‘Á½¥¹Ğ¹¥¹‘•á=˜ ½¹ÍĞÉ•ÍÕ±Ğ€ô…İ…¥Ğ€¡½Ù•ÉÉ¥‘•Ì¹•á•ÕÑ•½µµ…¹ñğ•á•ÕÑ•AÉ½Ù¥‘•É1¥™•å±•½µµ…¹¤œ¤°(€ÁÉ½Ù¥‘•É¹‘Á½¥¹Ğ¹¥¹‘•á=˜ ô…Ñ €¡•ÉÉ½È¤œ°ÁÉ½Ù¥‘•É¹‘Á½¥¹Ğ¹¥¹‘•á=˜ ½¹ÍĞÉ•ÍÕ±Ğ€ô…İ…¥Ğ€¡½Ù•ÉÉ¥‘•Ì¹•á•ÕÑ•½µµ…¹ñğ•á•ÕÑ•AÉ½Ù¥‘•É1¥™•å±•½µµ…¹¤œ¤¤°(¤ì)¥˜€ „¡ÁÉ½Ù¥‘•ÉMÕ•ÍÍ¥¹…±¥é…Ñ¥½¸¹¥¹‘•á=˜ …İ…¥ĞÉ•…ÕÑ¡½É¥é•AÉ½Ù¥‘•É1¥™•å±”œ¤(€€ğÁÉ½Ù¥‘•ÉMÕ•ÍÍ¥¹…±¥é…Ñ¥½¸¹¥¹‘•á=˜ ½Ù•ÉÉ¥‘•Ì¹½µÁ±•Ñ•I••¥ÁĞñğ½µÁ±•Ñ•¹Ñ•ÉÁÉ¥Í•I••¥ÁĞœ¤(€€˜˜ÁÉ½Ù¥‘•ÉMÕ•ÍÍ¥¹…±¥é…Ñ¥½¸¹±…ÍÑ%¹‘•á=˜ …İ…¥ĞÉ•…ÕÑ¡½É¥é•AÉ½Ù¥‘•É1¥™•å±”œ¤(€€€€øÁÉ½Ù¥‘•ÉMÕ•ÍÍ¥¹…±¥é…Ñ¥½¸¹¥¹‘•á=˜ ½Ù•ÉÉ¥‘•Ì¹½µÁ±•Ñ•I••¥ÁĞñğ½µÁ±•Ñ•¹Ñ•ÉÁÉ¥Í•I••¥ÁĞœ¤¤¤ì(€Ñ¡É½Ü¹•ÜÉÉ½È AÉ½Ù¥‘•ÈÍÕ•ÍÌ™¥¹…±¥é…Ñ¥½¸É•ÅÕ¥É•Ì½Á•É…Ñ¥½¸…ÕÑ¡½É¥Ñä‰½Ñ ‰•™½É”½µµ¥Ğ…¹‰•™½É”‘¥Í±½ÍÕÉ”¸œ¤ì)ô)½¹ÍĞÁÉ½Ù¥‘•É…¥±ÕÉ•¥¹…±¥é…Ñ¥½¸€ôÁÉ½Ù¥‘•É¹‘Á½¥¹Ğ¹Í±¥” (€ÁÉ½Ù¥‘•É¹‘Á½¥¹Ğ¹¥¹‘•á=˜ ‰Í…™•ÉÉ½È¹½‘”€„ôô€UQ!=I%iQ%=9}MQ1œˆ¤°(€ÁÉ½Ù¥‘•É¹‘Á½¥¹Ğ¹¥¹‘•á=˜ ¥˜€¡±…¥µ•‘I••¥ÁĞ€˜˜±…¥µ•‘ÕÑ¡½É¥Ñä€˜˜±…¥µ•‘¹Ù•±½Á”¤ìœ°ÁÉ½Ù¥‘•É¹‘Á½¥¹Ğ¹¥¹‘•á=˜ ‰Í…™•ÉÉ½È¹½‘”€„ôô€UQ!=I%iQ%=9}MQ1œˆ¤¤°(¤ì)¥˜€ „¡ÁÉ½Ù¥‘•É…¥±ÕÉ•¥¹…±¥é…Ñ¥½¸¹¥¹‘•á=˜ …İ…¥ĞÉ•…ÕÑ¡½É¥é•AÉ½Ù¥‘•É1¥™•å±”œ¤(€€ğÁÉ½Ù¥‘•É…¥±ÕÉ•¥¹…±¥é…Ñ¥½¸¹¥¹‘•á=˜ ½Ù•ÉÉ¥‘•Ì¹™…¥±I••¥ÁĞñğ™…¥±¹Ñ•ÉÁÉ¥Í•I••¥ÁĞœ¤(€€˜˜ÁÉ½Ù¥‘•É…¥±ÕÉ•¥¹…±¥é…Ñ¥½¸¹±…ÍÑ%¹‘•á=˜ …İ…¥ĞÉ•…ÕÑ¡½É¥é•AÉ½Ù¥‘•É1¥™•å±”œ¤(€€€€øÁÉ½Ù¥‘•É…¥±ÕÉ•¥¹…±¥é…Ñ¥½¸¹¥¹‘•á=˜ ½Ù•ÉÉ¥‘•Ì¹™…¥±I••¥ÁĞñğ™…¥±¹Ñ•ÉÁÉ¥Í•I••¥ÁĞœ¤¤¤ì(€Ñ¡É½Ü¹•ÜÉÉ½È AÉ½Ù¥‘•È™…¥±ÕÉ”™¥¹…±¥é…Ñ¥½¸É•ÅÕ¥É•Ì½Á•É…Ñ¥½¸…ÕÑ¡½É¥Ñä‰½Ñ ‰•™½É”½µµ¥Ğ…¹‰•™½É”‘¥Í±½ÍÕÉ”¸œ¤ì)ô)½¹ÍĞÁÉ½Ù¥‘•É1¥™•å±”€ôÉ•… ÍÕÁ…‰…Í”½™Õ¹Ñ¥½¹Ì½}Í¡…É•½ÁÉ½Ù¥‘•É1¥™•å±”¹ÑÌœ¤ì4)™½È€¡½¹ÍĞÉ•ÅÕ¥É•½˜l±•…¹ÕÁI•ÅÕ¥É•œ°€±•…¹ÕÁ½µÁ±•Ñ•œ°€±•…¹ÕÁQ•Éµ¥¹…±½‘”œ°€UQ!=I%iQ%=9}MQ1t¤ì4(€¥˜€ …ÁÉ½Ù¥‘•É1¥™•å±”¹¥¹±Õ‘•Ì¡É•ÅÕ¥É•¤¤Ñ¡É½Ü¹•ÜÉÉ½È¡AÉ½Ù¥‘•È±•…¹ÕÀ½É•½Ù•Éä‰½Õ¹‘…Éä¥Ìµ¥ÍÍ¥¹œ€‘íÉ•ÅÕ¥É•‘ô¹€¤ì4)ô4)½¹ÍĞÁÉ½Ù¥‘•ÉÕÑ¡½É¥é…Ñ¥½¹½ÉÉ•Ñ¥½¸€ôÉ•… ÍÕÁ…‰…Í”½µ¥É…Ñ¥½¹Ì¼ÈÀÈØÀàÀÔÄÈÀÀÀÁ}ÁÉ½Ù¥‘•É}±¥™•å±•}…ÕÑ¡½É¥é…Ñ¥½¹}…ÑÑ•µÁÑÌ¹ÍÅ°œ¤ì4)™½È€¡½¹ÍĞÉ•ÅÕ¥É•½˜l4(€€ÕÉÉ•¹Ñ}…ÕÑ¡½É¥é…Ñ¥½¸%L%MQ%9PI=4Á}…ÕÑ¡½É¥é…Ñ¥½¹}Ù•ÉÍ¥½¸œ°4(€€9QIAI%M}AI=Y%I}UQ!=I%iQ%=9}YIM%=9}MQ1œ°4(€€9QIAI%M}AI=Y%I}=I9%iQ%=9}UQ!=I%Qe}IEU%Iœ°4(€€•¹Ñ•ÉÁÉ¥Í•}…¥}É•½É‘}•™™•Ğœ°4)t¤ì4(€¥˜€ …ÁÉ½Ù¥‘•ÉÕÑ¡½É¥é…Ñ¥½¹½ÉÉ•Ñ¥½¸¹¥¹±Õ‘•Ì¡É•ÅÕ¥É•¤¤ì4(€€€Ñ¡É½Ü¹•ÜÉÉ½È¡AÉ½Ù¥‘•È…ÕÑ¡½É¥é…Ñ¥½¸µ…ÑÑ•µÁĞ½ÉÉ•Ñ¥½¸¥Ìµ¥ÍÍ¥¹œ€‘íÉ•ÅÕ¥É•‘ô¹€¤ì4(€ô4)ô4)½¹ÍĞÉ•…‘åI•Ù¥•İ½ÉÉ•Ñ¥½¸€ôÉ•… ÍÕÁ…‰…Í”½µ¥É…Ñ¥½¹Ì¼ÈÀÈØÀàÀÔÄĞÀÀÀÁ}•¹Ñ•ÉÁÉ¥Í•}¥¹Ñ•±±¥•¹•}É•…‘å}É•Ù¥•İ}½ÉÉ•Ñ¥½¹Ì¹ÍÅ°œ¤ì4)™½È€¡½¹ÍĞÉ•ÅÕ¥É•½˜l4(€€•¹Ñ•ÉÁÉ¥Í•}ÁÉ½Ù¥‘•É}É½ÕÑ•}É½±•}Õ…Éœ°€•¹Ñ•ÉÁÉ¥Í•}É•…Ñ•}•Ù¥‘•¹•}Í½ÕÉ•}É•½Éœ°4(€€•¹Ñ•ÉÁÉ¥Í•}É•½É‘}Í½ÕÉ•}•áÑÉ…Ñ¥½¹}ÍÕ•ÍÌœ°€9QIAI%M}Y%9}%Q}!%MQ=Ie}IEU%Iœ°4)t¤ì4(€¥˜€ …É•…‘åI•Ù¥•İ½ÉÉ•Ñ¥½¸¹¥¹±Õ‘•Ì¡É•ÅÕ¥É•¤¤Ñ¡É½Ü¹•ÜÉÉ½È¡I•…‘äµÉ•Ù¥•Ü½ÉÉ•Ñ¥½¸¥Ìµ¥ÍÍ¥¹œ€‘íÉ•ÅÕ¥É•‘ô¹€¤ì4)ô4)½¹ÍĞÁÉ½Ù¥‘•É½µµ¥ÑÑ•‘I•ÑÕÉ¸€ôÁÉ½Ù¥‘•É¹‘Á½¥¹Ğ¹¥¹‘•á=˜ ‰¥˜€¡É••¥ÁĞ¹ÍÑ…ÑÕÌ€ôôô€½µµ¥ÑÑ•œ¤ˆ¤ì4)½¹ÍĞÁÉ½Ù¥‘•ÉI•Á±…åÕÑ¡½É¥Ñä€ôÁÉ½Ù¥‘•É¹‘Á½¥¹Ğ¹¥¹‘•á=˜ É•…ÕÑ¡½É¥é•AÉ½Ù¥‘•É1¥™•å±”œ°ÁÉ½Ù¥‘•É½µµ¥ÑÑ•‘I•ÑÕÉ¸¤ì4)½¹ÍĞÁÉ½Ù¥‘•ÉI•…ÕÑ¡½É¥é•!•±Á•È€ôÁÉ½Ù¥‘•É¹‘Á½¥¹Ğ¹Í±¥” 4(€ÁÉ½Ù¥‘•É¹‘Á½¥¹Ğ¹¥¹‘•á=˜ ½¹ÍĞÉ•…ÕÑ¡½É¥é•AÉ½Ù¥‘•É1¥™•å±”œ¤°4(€ÁÉ½Ù¥‘•É¹‘Á½¥¹Ğ¹¥¹‘•á=˜ •áÁ½ÉĞ½¹ÍĞÁÉ½Ù¥‘•É1¥™•å±•I•ÅÕ•ÍÑ!…Í œ¤°4(¤ì4)¥˜€ „¡ÁÉ½Ù¥‘•É½µµ¥ÑÑ•‘I•ÑÕÉ¸€øô€À€˜˜ÁÉ½Ù¥‘•ÉI•Á±…åÕÑ¡½É¥Ñä€øÁÉ½Ù¥‘•É½µµ¥ÑÑ•‘I•ÑÕÉ¸¤4(€ñğ€…ÁÉ½Ù¥‘•ÉI•…ÕÑ¡½É¥é•!•±Á•È¹¥¹±Õ‘•Ì …ÍÍ•ÉÑAÉ½Ù¥‘•É1¥™•å±•=Á•É…Ñ¥½¹ÕÑ¡½É¥Ñäœ¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È AÉ½Ù¥‘•ÈÑ•Éµ¥¹…°É••¥ÁĞ‘¥Í±½ÍÕÉ”É•ÅÕ¥É•Ì½Á•É…Ñ¥½¸µÍÁ•¥™¥Œ…ÕÑ¡½É¥é…Ñ¥½¸¸œ¤ì4)ô4)½¹ÍĞ•áÑÉ…Ñ¥½¹½µµ…¹€ô½µµ…¹¹Í±¥” 4(€½µµ…¹¹¥¹‘•á=˜ ½¹ÍĞ½µµ…¹‘Ù¥‘•¹•áÑÉ…Ğœ¤°4(€½µµ…¹¹¥¹‘•á=˜ ½¹ÍĞ½µµ…¹‘Ù¥‘•¹•…¹‘¥‘…Ñ•I•Ù¥•Üœ¤°4(¤ì4)¥˜€ ½¥¹Í•ÉÑI½İp¡lœ‰u•¹Ñ•ÉÁÉ¥Í•}…¥}©½‰}±•‘•È½¥Ô¹Ñ•ÍĞ¡•áÑÉ…Ñ¥½¹½µµ…¹¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È Ù¥‘•¹”•áÑÉ…Ñ¥½¸©½‰ÌµÕÍĞ‰”±…¥µ•½ÈÉ•ÍÕµ•Ñ¡É½Õ Ñ¡”™•¹•Í•ÉÙ¥”IA¸œ¤ì4)ô4)¥˜€ ½ÕÁ‘…Ñ•I½İÍp¡lœ‰u•¹Ñ•ÉÁÉ¥Í•}…¥}©½‰}±•‘•È½¥Ô¹Ñ•ÍĞ¡•áÑÉ…Ñ¥½¹½µµ…¹¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È Ù¥‘•¹”•áÑÉ…Ñ¥½¸Ñ•Éµ¥¹…°ÍÑ…Ñ”µÕÍĞ‰”É••¥ÁĞµ…Ñ½µ¥Œ°¹½Ğ„‘¥É•ĞÑ…‰±”Á…Ñ ¸œ¤ì4)ô4)¥˜€ „¡•áÑÉ…Ñ¥½¹½µµ…¹¹¥¹‘•á=˜ •¹Ñ•ÉÁÉ¥Í•}±…¥µ}½É}É•ÍÕµ•}•Ù¥‘•¹•}•áÑÉ…Ñ¥½¹}©½‰}ØÈœ¤4(€€ğ•áÑÉ…Ñ¥½¹½µµ…¹¹¥¹‘•á=˜ ÉÕ¹½Ù•É¹•‘AÉ½Ù¥‘•ÉI•ÅÕ•ÍĞœ¤¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È Ù¥‘•¹”•áÑÉ…Ñ¥½¸µÕÍĞ½İ¸Ñ¡”™•¹•©½ˆ…ÑÑ•µÁĞ‰•™½É”ÁÉ½Ù¥‘•È¥¹Ù½…Ñ¥½¸¸œ¤ì4)ô4)½¹ÍĞÍÕÁ…‰…Í•QÉ…¹ÍÁ½ÉĞ€ôÉ•… ÍÕÁ…‰…Í”½™Õ¹Ñ¥½¹Ì½}Í¡…É•½ÍÕÁ…‰…Í”¹ÑÌœ¤ì4)¥˜€ …ÍÕÁ…‰…Í•QÉ…¹ÍÁ½ÉĞ¹¥¹±Õ‘•Ì ±…ÍÌMÕÁ…‰…Í•IÁÉÉ½Èœ¤ñğ€…ÍÕÁ…‰…Í•QÉ…¹ÍÁ½ÉĞ¹¥¹±Õ‘•Ì …İ…¥ĞÉ•ÍÁ½¹Í”¹Ñ•áĞ ¤œ¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È IA™…¥±ÕÉ•ÌÉ•ÅÕ¥É”½¹”ÑåÁ•°Í¥¹±”µÉ•…¥¹Ñ•É¹…°•ÉÉ½È‰½Õ¹‘…Éä¸œ¤ì4)ô4)¥˜€ ½µ•ÍÍ…•p¹¥¹±Õ‘•Íp¡lœ‰u9QIAI%M|½Ô¹Ñ•ÍĞ¡½µµ…¹¤4(€ñğ€½µ•ÍÍ…•p¹¥¹±Õ‘•Íp¡lœ‰u9QIAI%M|½Ô¹Ñ•ÍĞ¡É•… ÍÕÁ…‰…Í”½™Õ¹Ñ¥½¹Ì½}Í¡…É•½•¹Ñ•ÉÁÉ¥Í•I••¥ÁĞ¹ÑÌœ¤¤4(€ñğ€½µ•ÍÍ…•p¹¥¹±Õ‘•Íp¡lœ‰u9QIAI%M|½Ô¹Ñ•ÍĞ¡É•… ÍÕÁ…‰…Í”½™Õ¹Ñ¥½¹Ì½}Í¡…É•½ÁÉ½Ù¥‘•É1¥™•å±”¹ÑÌœ¤¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È ½µ…¥¸•ÉÉ½ÉÌµÕÍĞ‰”µ…ÁÁ•™É½´ÍÑÉÕÑÕÉ•IA™¥•±‘Ì°¹½Ğ™±…ÑÑ•¹•µ•ÍÍ…”ÍÑÉ¥¹Ì¸œ¤ì4)ô4)½¹ÍĞ…Ñ½µ¥AÉ½µ½Ñ¥½¸€ôÉ•… ÍÕÁ…‰…Í”½µ¥É…Ñ¥½¹Ì¼ÈÀÈØÀàÀÔÄÔÀÀÀÁ}•¹Ñ•ÉÁÉ¥Í•}…Ñ½µ¥}…¹‘¥‘…Ñ•}ÁÉ½µ½Ñ¥½¸¹ÍÅ°œ¤ì4)½¹ÍĞ•áÑÉ…Ñ¥½¹I•½Ù•Éä€ôÉ•… ÍÕÁ…‰…Í”½µ¥É…Ñ¥½¹Ì¼ÈÀÈØÀàÀÔÄØÀÀÀÁ}•¹Ñ•ÉÁÉ¥Í•}ÉÁ}•ÉÉ½É}…¹‘}•áÑÉ…Ñ¥½¹}É•½Ù•Éä¹ÍÅ°œ¤ì4)½¹ÍĞÉ•Ù¥•İÕÑ¡½É¥Ñå½ÉÉ•Ñ¥½¸€ôÉ•… ÍÕÁ…‰…Í”½µ¥É…Ñ¥½¹Ì¼ÈÀÈØÀàÀÜÄÈÀÀÀÁ}•¹Ñ•ÉÁÉ¥Í•}É•Ù¥•İ}…Ñ¥½¹}É•Á±…å}…ÕÑ¡½É¥Ñä¹ÍÅ°œ¤ì4)™½È€¡½¹ÍĞÉ•ÅÕ¥É•½˜l4(€€•¹Ñ•ÉÁÉ¥Í•}É•Í½ÕÉ•}Í¹…ÁÍ¡½Ğœ°€•¹Ñ•ÉÁÉ¥Í•}É•Í½±Ù•}¡¥¡}¥µÁ…Ñ}É•Ù¥•İ}…ÕÑ¡½É¥Ñäœ°4(€€•¹Ñ•ÉÁÉ¥Í•}É•½É‘}¡¥¡}¥µÁ…Ñ}É•Ù¥•İ}ØÈœ°€•¹Ñ•ÉÁÉ¥Í•}½µµ¥Ñ}¡¥¡}¥µÁ…Ñ}…ÁÁÉ½Ù…±}ØÈœ°4(€€I=4AU	1%°…¹½¸°…ÕÑ¡•¹Ñ¥…Ñ•œ°€Q<Í•ÉÙ¥•}É½±”œ°4)t¤ì4(€¥˜€ …É•Ù¥•İÕÑ¡½É¥Ñå½ÉÉ•Ñ¥½¸¹¥¹±Õ‘•Ì¡É•ÅÕ¥É•¤¤ì4(€€€Ñ¡É½Ü¹•ÜÉÉ½È¡…¹½¹¥…°É•Ù¥•Ü…ÕÑ¡½É¥Ñä½ÉÉ•Ñ¥½¸¥Ìµ¥ÍÍ¥¹œ€‘íÉ•ÅÕ¥É•‘ô¹€¤ì4(€ô4)ô4)¥˜€ …É•Ù¥•İÕÑ¡½É¥Ñå½ÉÉ•Ñ¥½¸¹¥¹±Õ‘•Ì I=4Í•ÉÙ¥•}É½±”œ¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È 1•…ä‘”¡…Í ½É•Ù¥•Üµ¥‘•¹Ñ¥ÑäİÉ…ÁÁ•ÉÌµÕÍĞ‰”É•Ù½­•™É½´Í•ÉÙ¥•}É½±”¸œ¤ì4)ô4)½¹ÍĞ•áÑÉ…Ñ¥½¹I½ÕÑ•MÑ…¥¹œ€ôÉ•… ÍÕÁ…‰…Í”½µ¥É…Ñ¥½¹Ì¼ÈÀÈØÀàÀÔÄÜÀÀÀÁ}•¹Ñ•ÉÁÉ¥Í•}•áÑÉ…Ñ¥½¹}É½ÕÑ•}…¹‘}ÍÑ…¥¹œ¹ÍÅ°œ¤ì4)™½È€¡½¹ÍĞÉ•ÅÕ¥É•½˜l4(€€•¹Ñ•ÉÁÉ¥Í•}±…¥µ}½É}É•ÍÕµ•}•Ù¥‘•¹•}•áÑÉ…Ñ¥½¹}©½ˆœ°€•¹Ñ•ÉÁÉ¥Í•}™…¥±}•Ù¥‘•¹•}•áÑÉ…Ñ¥½¹}©½ˆœ°4(€€É••¥ÁÑ}¥œ°€Í½ÕÉ•}Ù•ÉÍ¥½¹}¥œ°€É•ÅÕ•ÍÑ}¡…Í œ°€•á•ÕÑ¥½¹}Ñ½­•¸œ°€•á•ÕÑ¥½¹}™•¹”œ°4(€€…ÑÑ•µÁÑ}±•…Í•}•áÁ¥É•Í}…Ğœ°€…ÑÑ•µÁÑ}½Õ¹Ğœ°€É•½Ù•Éå}½Õ¹Ğœ°€•¹Ñ•ÉÁÉ¥Í•}…¥}©½‰}…ÑÑ•µÁÑÌœ°4(€€‘½•Ì¹½Ğ±…¥´•á…Ñ±äµ½¹”ÁÉ½Ù¥‘•È¥¹Ù½…Ñ¥½¸œ°4)t¤ì4(€¥˜€ …•áÑÉ…Ñ¥½¹I•½Ù•Éä¹¥¹±Õ‘•Ì¡É•ÅÕ¥É•¤¤Ñ¡É½Ü¹•ÜÉÉ½È¡áÑÉ…Ñ¥½¸É•½Ù•Éä½¹ÑÉ…Ğ¥Ìµ¥ÍÍ¥¹œ€‘íÉ•ÅÕ¥É•‘ô¹€¤ì4)ô4)½¹ÍĞ•áÑÉ…Ñ¥½¹±…¥µMÅ°€ô•áÑÉ…Ñ¥½¹I•½Ù•Éä¹Í±¥” 4(€•áÑÉ…Ñ¥½¹I•½Ù•Éä¹¥¹‘•á=˜ IQ=HIA1U9Q%=8ÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}±…¥µ}½É}É•ÍÕµ•}•Ù¥‘•¹•}•áÑÉ…Ñ¥½¹}©½ˆœ¤°4(€•áÑÉ…Ñ¥½¹I•½Ù•Éä¹¥¹‘•á=˜ IQ=HIA1U9Q%=8ÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}™…¥±}•Ù¥‘•¹•}•áÑÉ…Ñ¥½¹}©½ˆœ¤°4(¤ì4)¥˜€ …•áÑÉ…Ñ¥½¹±…¥µMÅ°¹¥¹±Õ‘•Ì Á}©½‰}¥±Á}½Éœ±Á}İ½É­ÍÁ…”±Á}…Á…‰¥±¥Ñäœ¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È áÑÉ…Ñ¥½¸É•½Ù•ÉäµÕÍĞ¥¹Í•ÉĞ½¹±äÑ¡”ÍÑ…‰±”Á±…¹¹•©½ˆ%¸œ¤ì4)ô4)¥˜€¡•áÑÉ…Ñ¥½¹±…¥µMÅ°¹¥¹±Õ‘•Ì •¹}É…¹‘½µ}ÕÕ¥ ¤œ¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È áÑÉ…Ñ¥½¸É•½Ù•ÉäµÕÍĞ¹•Ù•È•¹•É…Ñ”„É•Á±…•µ•¹Ğ©½ˆ%¸œ¤ì4)ô4)™½È€¡½¹ÍĞ™½É‰¥‘‘•¸½˜lÉ…İ}ÁÉ½µÁĞœ°€ÁÉ½µÁÑ}‰½‘äœ°€É…İ}½µÁ±•Ñ¥½¸œ°€½µÁ±•Ñ¥½¹}‰½‘äœ°€ÁÉ½Ù¥‘•É}­•äœ°€…ÕÑ¡½É¥é…Ñ¥½¸t¤ì4(€¥˜€¡•áÑÉ…Ñ¥½¹I•½Ù•Éä¹¥¹±Õ‘•Ì¡™½É‰¥‘‘•¸¤¤Ñ¡É½Ü¹•ÜÉÉ½È¡áÑÉ…Ñ¥½¸©½ˆ½…ÑÑ•µÁĞ±•‘•È½¹Ñ…¥¹Ì™½É‰¥‘‘•¸™¥•±€‘í™½É‰¥‘‘•¹ô¹€¤ì4)ô4)™½È€¡½¹ÍĞÉ•ÅÕ¥É•½˜l4(€€•¹Ñ•ÉÁÉ¥Í•}±…¥µ}½É}É•ÍÕµ•}•Ù¥‘•¹•}•áÑÉ…Ñ¥½¹}©½‰}ØÈœ°4(€€•¹Ñ•ÉÁÉ¥Í•}…¥}•áÑÉ…Ñ¥½¹}ÍÑ…•‘}É•ÍÕ±ÑÌœ°4(€€•¹Ñ•ÉÁÉ¥Í•}ÍÑ…•}•Ù¥‘•¹•}•áÑÉ…Ñ¥½¹}É•ÍÕ±Ğœ°4(€€•¹Ñ•ÉÁÉ¥Í•}½µµ¥Ñ}ÍÑ…•‘}•Ù¥‘•¹•}•áÑÉ…Ñ¥½¸œ°4(€€‰É••¥ÁĞ¹•á•ÕÑ¥½¹}Á±…¸´øøÉ½ÕÑ•%œˆ°4(€€‰É••¥ÁĞ¹•á•ÕÑ¥½¹}Á±…¸´øøµ½‘•°œˆ°4)t¤ì4(€¥˜€ …•áÑÉ…Ñ¥½¹I½ÕÑ•MÑ…¥¹œ¹¥¹±Õ‘•Ì¡É•ÅÕ¥É•¤¤Ñ¡É½Ü¹•ÜÉÉ½È¡áÑÉ…Ñ¥½¸É½ÕÑ”½ÍÑ…¥¹œ½¹ÑÉ…Ğ¥Ìµ¥ÍÍ¥¹œ€‘íÉ•ÅÕ¥É•‘ô¹€¤ì4)ô4)¥˜€ „¡•áÑÉ…Ñ¥½¹½µµ…¹¹¥¹‘•á=˜ É•…‘Ù¥‘•¹•áÑÉ…Ñ¥½¹I½ÕÑ•A±…¸œ¤€ğ•áÑÉ…Ñ¥½¹½µµ…¹¹¥¹‘•á=˜ É•Í½±Ù•I½ÕÑ” œ¤¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È I•½Ù•É••áÑÉ…Ñ¥½¸µÕÍĞÉ•…¥ÑÌ¥µµÕÑ…‰±”É½ÕÑ”Á±…¸‰•™½É”É½ÕÑ”É•Í½±ÕÑ¥½¸¸œ¤ì4)ô4)¥˜€ …•áÑÉ…Ñ¥½¹½µµ…¹¹¥¹±Õ‘•Ì ìÉ½ÕÑ•%èÉ½ÕÑ•A±…¸¹É½ÕÑ•%°µ½‘•°èÉ½ÕÑ•A±…¸¹µ½‘•°ôœ¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È I•½Ù•É••áÑÉ…Ñ¥½¸µÕÍĞÉ•Ù…±¥‘…Ñ”Ñ¡”•á…ĞÁ±…¹¹•É½ÕÑ”…¹µ½‘•°¸œ¤ì4)ô4)¥˜€ …ÁÉ½Ù¥‘•ÉI•Í½±Ù•È¹¥¹±Õ‘•Ì Ù…±¥‘…Ñ•¹Ñ•ÉÁÉ¥Í•á…ÑI½ÕÑ•5½‘•°œ¤4(€ñğ€…ÁÉ½Ù¥‘•ÉI•Í½±Ù•È¹¥¹±Õ‘•Ì Á±…¹¹•‘5½‘•°€„ôôÕÉÉ•¹ÑI½ÕÑ•5½‘•°œ¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È Á±…¹¹••áÑÉ…Ñ¥½¸µ½‘•°µÕÍĞ•ÅÕ…°Ñ¡”•á…ĞÉ½ÕÑ”ÕÉÉ•¹Ğµ½‘•°¸œ¤ì4)ô4)½¹ÍĞ•á…ÑI½ÕÑ•5½‘•±Y…±¥‘…Ñ¥½¸€ôÁÉ½Ù¥‘•ÉI•Í½±Ù•È¹Í±¥” 4(€ÁÉ½Ù¥‘•ÉI•Í½±Ù•È¹¥¹‘•á=˜ •áÁ½ÉĞ½¹ÍĞÙ…±¥‘…Ñ•¹Ñ•ÉÁÉ¥Í•á…ÑI½ÕÑ•5½‘•°œ¤°4(€ÁÉ½Ù¥‘•ÉI•Í½±Ù•È¹¥¹‘•á=˜ ½¹ÍĞ¹½Éµ…±¥é•AÉ½Ù¥‘•Èœ¤°4(¤ì4)¥˜€¡•á…ÑI½ÕÑ•5½‘•±Y…±¥‘…Ñ¥½¸¹¥¹±Õ‘•Ì ‘•™…Õ±Ñ}µ½‘•°œ¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È á…ĞµÉ½ÕÑ”Ù…±¥‘…Ñ¥½¸µÕÍĞ¹½ĞÍÕ‰ÍÑ¥ÑÕÑ”Ñ¡”ÁÉ½Ù¥‘•Èµ½¹™¥œ‘•™…Õ±Ğµ½‘•°¸œ¤ì4)ô4)¥˜€ …ÍÕÁ…‰…Í•IÁŒ¹¥¹±Õ‘•Ì ±…ÍÌMÕÁ…‰…Í•IÁQÉ…¹ÍÁ½ÉÑÉÉ½Èœ¤4(€ñğ€…ÍÕÁ…‰…Í•IÁŒ¹¥¹±Õ‘•Ì ˆÉ•ÍÁ½¹Í•}‘•½‘•}™…¥±•œˆ¤4(€ñğ€…ÍÕÁ…‰…Í•IÁŒ¹¥¹±Õ‘•Ì ˆÉ•ÍÁ½¹Í•}É•…‘}™…¥±•œˆ¤4(€ñğ€…ÍÕÁ…‰…Í•IÁŒ¹¥¹±Õ‘•Ì ˆÑÉ…¹Í¥•¹Ñ}¡ÑÑÁ|ÔÀÈœˆ¤4(€ñğ€…ÍÕÁ…‰…Í•IÁŒ¹¥¹±Õ‘•Ì ˆÑÉ…¹Í¥•¹Ñ}¡ÑÑÁ|ÔÀÌœˆ¤4(€ñğ€…ÍÕÁ…‰…Í•IÁŒ¹¥¹±Õ‘•Ì ˆÑÉ…¹Í¥•¹Ñ}¡ÑÑÁ|ÔÀĞœˆ¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È IAÑÉ…¹ÍÁ½ÉĞ…¹É•ÍÁ½¹Í”µ‘•½‘”Õ¹•ÉÑ…¥¹ÑäµÕÍĞÉ•µ…¥¸ÑåÁ•…¹‰½Õ¹‘•¸œ¤ì4)ô4)¥˜€ …ÍÕÁ…‰…Í•IÁŒ¹¥¹±Õ‘•Ì ½Ù•É¹•‘IÁ½µ…¥¹M¥¹…±Ìœ¤4(€ñğ€…ÍÕÁ…‰…Í•IÁŒ¹¥¹±Õ‘•Ì ÉÁÉÉ½É!…Í½Ù•É¹•‘½µ…¥¹M¥¹…°œ¤4(€ñğ€…ÍÕÁ…‰…Í•IÁŒ¹¥¹±Õ‘•Ì ÑÉ…¹Í¥•¹ÑIÁ!ÑÑÁ±…ÍÍ¥™¥…Ñ¥½¸¡É•ÍÁ½¹Í”¹ÍÑ…ÑÕÌ¤œ¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È QÉ…¹Í¥•¹ĞIAÉ•ÍÁ½¹Í•ÌÉ•ÅÕ¥É”•á…Ğ½Ù•É¹•µ‘½µ…¥¸±…ÍÍ¥™¥…Ñ¥½¸¸œ¤ì4)ô4)¥˜€ ½…Ñ¡qÌ©qíqÌ©p½p¨‘¥Í…ÉÕ¹É•…‘…‰±”É•ÍÁ½¹Í”‰½‘¥•Ìp©p½qÌ©qô½Ô¹Ñ•ÍĞ¡ÍÕÁ…‰…Í•IÁŒ¤4(€ñğ€½Ñ¡É½ÜÁ…ÉÍ•IÁ…¥±ÕÉ•p¡É•ÍÁ½¹Í•p¹ÍÑ…ÑÕÌ°‰½‘åp¤½Ô¹Ñ•ÍĞ¡ÍÕÁ…‰…Í•IÁŒ¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È U¹É•…‘…‰±”½ÈÑÉ…¹Í¥•¹ĞIAÉ•ÍÁ½¹Í•ÌµÕÍĞ¹½Ğ‰•½µ”Õ¹½¹‘¥Ñ¥½¹…°‘…Ñ…‰…Í”™…¥±ÕÉ•Ì¸œ¤ì4)ô4)¥˜€ …½µµ…¹¹¥¹±Õ‘•Ì ‰‘¥ÍÁ½Í¥Ñ¥½¸€ô€ÁÉ•Í•ÉÙ•}±…¥µ•‘}É••¥ÁĞœˆ¤4(€ñğ½µµ…¹¹¥¹±Õ‘•Ì ‰ÑåÁ•½˜±…¥µ•‘I••¥ÁĞ¹•á•ÕÑ¥½¹}Á±…¸ü¹©½‰%€ôôô€ÍÑÉ¥¹œœˆ¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È áÑÉ…Ñ¥½¸Õ¹•ÉÑ…¥¹ÑäµÕÍĞÕÍ”…¸•áÁ±¥¥Ğ¥¹Ñ•É¹…°‘¥ÍÁ½Í¥Ñ¥½¸°¹½ĞÉ••¥ÁĞµÍ¡…Á”¥¹™•É•¹”¸œ¤ì4)ô4)¥˜€ …•áÑÉ…Ñ¥½¹½µµ…¹¹¥¹±Õ‘•Ì ½¹ÍĞÍ…™•I•ÍÕ±Ğ€ôìÉ•Í½ÕÉ•%è©½‰%°©½‰%°œ¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È áÑÉ…Ñ¥½¸É•ÍÁ½¹Í•ÌµÕÍĞ¥‘•¹Ñ¥™äÑ¡”©½ˆ…ÌÑ¡”…¹½¹¥…°É••¥ÁĞÉ•Í½ÕÉ”¸œ¤ì4)ô4)¥˜€ …•áÑÉ…Ñ¥½¹I½ÕÑ•MÑ…¥¹œ¹¥¹±Õ‘•Ì ‰Á}É•ÍÕ±Ğ´øøÉ•Í½ÕÉ•%œ%L%MQ%9PI=4Á}©½‰}¥èéÑ•áĞˆ¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È MÑ…¥¹œµÕÍĞ‰¥¹Ñ¡”Í…¹¥Ñ¥é•É•ÍÁ½¹Í”É•Í½ÕÉ”Ñ¼Ñ¡”•áÑÉ…Ñ¥½¸©½ˆ¸œ¤ì4)ô4)¥˜€ „¡•áÑÉ…Ñ¥½¹½µµ…¹¹¥¹‘•á=˜ •¹Ñ•ÉÁÉ¥Í•}ÍÑ…•}•Ù¥‘•¹•}•áÑÉ…Ñ¥½¹}É•ÍÕ±Ğœ¤4(€€ğ•áÑÉ…Ñ¥½¹½µµ…¹¹±…ÍÑ%¹‘•á=˜ ½µµ¥ÑMÑ…•‘Ù¥‘•¹•áÑÉ…Ñ¥½¸œ¤¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È Í…¹¥Ñ¥é•ÍÑ…•É•ÍÕ±ĞµÕÍĞ•á¥ÍĞ‰•™½É”…¹½¹¥…°•áÑÉ…Ñ¥½¸½µµ¥Ğ¸œ¤ì4)ô4)½¹ÍĞÕ¹•ÉÑ…¥¹½µµ¥Ğ€ô½µµ…¹¹Í±¥” 4(€½µµ…¹¹¥¹‘•á=˜ ½¹ÍĞ½µµ¥ÑMÑ…•‘Ù¥‘•¹•áÑÉ…Ñ¥½¸œ¤°4(€½µµ…¹¹¥¹‘•á=˜ ½¹ÍĞ½µµ…¹‘Ù¥‘•¹•áÑÉ…Ğœ¤°4(¤ì4)¥˜€¡Õ¹•ÉÑ…¥¹½µµ¥Ğ¹¥¹±Õ‘•Ì •¹Ñ•ÉÁÉ¥Í•}™…¥±}•Ù¥‘•¹•}•áÑÉ…Ñ¥½¹}©½ˆœ¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È •¹•É¥ŒÍÑ…¥¹œ½½µµ¥ĞÕ¹•ÉÑ…¥¹ÑäµÕÍĞ¹½ĞÑ•Éµ¥¹…±¥é”Ñ¡”•áÑÉ…Ñ¥½¸©½ˆ¸œ¤ì4)ô4)¥˜€ …Õ¹•ÉÑ…¥¹½µµ¥Ğ¹¥¹±Õ‘•Ì Ñ¡É½Üµ…ÁáÑÉ…Ñ¥½¹A•ÉÍ¥ÍÑ•¹•ÉÉ½È¡•ÉÉ½È¤œ¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È …¹½¹¥…°•áÑÉ…Ñ¥½¸½µµ¥ĞÕ¹•ÉÑ…¥¹ÑäµÕÍĞÁÉ•Í•ÉÙ”Ñ¡”±…¥µ•É••¥ÁĞ¸œ¤ì4)ô4)½¹ÍĞÍÑ…•U¹•ÉÑ…¥¹Ñä€ô•áÑÉ…Ñ¥½¹½µµ…¹¹Í±¥” 4(€•áÑÉ…Ñ¥½¹½µµ…¹¹¥¹‘•á=˜ ‰ÉÁŒ •¹Ñ•ÉÁÉ¥Í•}ÍÑ…•}•Ù¥‘•¹•}•áÑÉ…Ñ¥½¹}É•ÍÕ±Ğœˆ¤°4(€•áÑÉ…Ñ¥½¹½µµ…¹¹±…ÍÑ%¹‘•á=˜ …İ…¥Ğ½µµ¥ÑMÑ…•‘Ù¥‘•¹•áÑÉ…Ñ¥½¸œ¤°4(¤ì4)¥˜€ …ÍÑ…•U¹•ÉÑ…¥¹Ñä¹¥¹±Õ‘•Ì Ñ¡É½Üµ…ÁáÑÉ…Ñ¥½¹A•ÉÍ¥ÍÑ•¹•ÉÉ½È¡•ÉÉ½È¤œ¤4(€ñğÍÑ…•U¹•ÉÑ…¥¹Ñä¹¥¹±Õ‘•Ì ™…¥±Ù¥‘•¹•áÑÉ…Ñ¥½¹ÑÑ•µÁĞœ¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È áÑÉ…Ñ¥½¸ÍÑ…¥¹œÕ¹•ÉÑ…¥¹ÑäµÕÍĞÁÉ•Í•ÉÙ”Ñ¡”É••¥ÁĞİ¥Ñ¡½ÕĞ™…¥±ÕÉ”…ÕÑ¡½É¥Ñä¸œ¤ì4)ô4)½¹ÍĞÁÉ½µ½Ñ¥½¹½µµ…¹€ô½µµ…¹¹Í±¥” 4(€½µµ…¹¹¥¹‘•á=˜ ½¹ÍĞ½µµ…¹‘Ù¥‘•¹•ÍÍ•ÍÍAÉ½µ½Ñ”œ¤°4(€½µµ…¹¹¥¹‘•á=˜ ½¹ÍĞ…ÍÍ•ÉÑÁÁÉ½Ù•‘ÁÁ±¥…Ñ¥½¹ÍÍ•ÍÍµ•¹Ğœ¤°4(¤ì4)¥˜€ ½™½ÉqÌ©p¡mx¥t©…¹‘¥‘…Ñ•mx¥t©p¥mqÍqMt¨ıÉÁp¡lœ‰u•¹Ñ•ÉÁÉ¥Í•}ÁÉ½µ½Ñ•}•Ù¥‘•¹•}Ñ½}…ÍÍ•ÍÍ}ØÈ½¥Ô¹Ñ•ÍĞ¡ÁÉ½µ½Ñ¥½¹½µµ…¹¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È ÍÍ•ÍÌ…¹‘¥‘…Ñ”ÁÉ½µ½Ñ¥½¸µÕÍĞ¹½Ğ±½½À½Ù•ÈÑ¡”Í¥¹±”µ…¹‘¥‘…Ñ”IA¸œ¤ì4)ô4)¥˜€ ¡ÁÉ½µ½Ñ¥½¹½µµ…¹¹µ…Ñ  ½•¹Ñ•ÉÁÉ¥Í•}ÁÉ½µ½Ñ•}•Ù¥‘•¹•}‰…Ñ¡}Ñ½}…ÍÍ•ÍÍ}ØÈ½Ô¤ñğmt¤¹±•¹Ñ €„ôô€Ä¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È =¹”ÍÍ•ÍÌÁÉ½µ½Ñ¥½¸½µµ…¹µÕÍĞ¥ÍÍÕ”•á…Ñ±ä½¹”‰…Ñ ÁÉ½µ½Ñ¥½¸IA¸œ¤ì4)ô4)½¹ÍĞ½µÁ±•Ñ•Y…±¥‘…Ñ¥½¸€ô…Ñ½µ¥AÉ½µ½Ñ¥½¸¹¥¹‘•á=˜ œ´´±°ÁÉ•½¹‘¥Ñ¥½¹Ì…É”¹½Ü±½­•…¹Ù…±¥¸œ¤ì4)½¹ÍĞ™¥ÉÍÑAÉ½µ½Ñ¥½¹5ÕÑ…Ñ¥½¸€ô…Ñ½µ¥AÉ½µ½Ñ¥½¸¹¥¹‘•á=˜ %9MIP%9Q<ÁÕ‰±¥Œ¹…ÍÍ•ÍÍ}ØÉ}…Í•}Ù•ÉÍ¥½¹Ìœ¤ì4)¥˜€ „¡½µÁ±•Ñ•Y…±¥‘…Ñ¥½¸€øô€À€˜˜™¥ÉÍÑAÉ½µ½Ñ¥½¹5ÕÑ…Ñ¥½¸€ø½µÁ±•Ñ•Y…±¥‘…Ñ¥½¸¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È ÍÍ•ÍÌ‰…Ñ ÁÉ½µ½Ñ¥½¸µÕÍĞ½µÁ±•Ñ”Í•ĞÙ…±¥‘…Ñ¥½¸‰•™½É”¥ÑÌ™¥ÉÍĞµÕÑ…Ñ¥½¸¸œ¤ì4)ô4)½¹ÍĞ‰…Ñ¡™™•Ğ€ô…Ñ½µ¥AÉ½µ½Ñ¥½¸¹¥¹‘•á=˜ AI=I4ÁÕ‰±¥Œ¹•¹Ñ•ÉÁÉ¥Í•}…¥}É•½É‘}•™™•Ğœ¤ì4)½¹ÍĞ‰…Ñ¡I•ÑÕÉ¸€ô…Ñ½µ¥AÉ½µ½Ñ¥½¸¹¥¹‘•á=˜ IQUI8É•ÍÕ±Ğìœ°‰…Ñ¡™™•Ğ¤ì4)¥˜€ „¡‰…Ñ¡™™•Ğ€ø™¥ÉÍÑAÉ½µ½Ñ¥½¹5ÕÑ…Ñ¥½¸€˜˜‰…Ñ¡I•ÑÕÉ¸€ø‰…Ñ¡™™•Ğ¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È ÍÍ•ÍÌ‰…Ñ ÁÉ½µ½Ñ¥½¸µÕÍĞ©½ÕÉ¹…°¥ÑÌ½¹”É••¥ÁĞ•™™•Ğ‰•™½É”ÍÕ•ÍÌ¸œ¤ì4)ô4)¥˜€ ……Ñ½µ¥AÉ½µ½Ñ¥½¸¹¥¹±Õ‘•Ì ˆÉ•Í½ÕÉ•%œ°…ÍÍ•ÍÍ}…Í”¹¥ˆ¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È ÍÍ•ÍÌ‰…Ñ ÁÉ½µ½Ñ¥½¸µÕÍĞÉ•ÑÕÉ¸Ñ¡”ÍÍ•ÍÌ‘É…™Ğ…Ì¥ÑÌ…¹½¹¥…°É•Í½ÕÉ”%¸œ¤ì4)ô4)½¹ÍĞÉ•Í½ÕÉ•I•Í½±Ù•È€ô½µµ…¹¹Í±¥” (€½µµ…¹¹¥¹‘•á=˜ •áÁ½ÉĞ½¹ÍĞÉ•Í½±Ù•¹Ñ•ÉÁÉ¥Í•½µµ…¹‘I•Í½ÕÉ•%œ¤°4(€½µµ…¹¹¥¹‘•á=˜ ½¹ÍĞ•¹ÍÕÉ•á•ÕÑ¥½¹A±…¸œ¤°4(¤ì)¥˜€ …É•Í½ÕÉ•I•Í½±Ù•È¹¥¹±Õ‘•Ì ‰½µµ…¹‘QåÁ”€ôôô€•Ù¥‘•¹”¹…ÍÍ•ÍÌ¹ÁÉ½µ½Ñ”œˆ¤(€ñğ€…É•Í½ÕÉ•I•Í½±Ù•È¹¥¹±Õ‘•Ì œüÉ•ÍÕ±Ñ=‰©•Ğ¹…ÍÍ•ÍÍÉ…™Ñ%œ¤(€ñğ€…É•Í½ÕÉ•I•Í½±Ù•È¹¥¹±Õ‘•Ì ±¥¹•…•I•Í½ÕÉ•%€„ôô•áÁ±¥¥ÑI•Í½ÕÉ•%œ¤(€ñğ€½É•ÑÕÉ¹qÌ­É•ÍÕ±Ñ=‰©•Ñp¹Í½ÕÉ•%½Ô¹Ñ•ÍĞ¡É•Í½ÕÉ•I•Í½±Ù•È¤¤ì(€Ñ¡É½Ü¹•ÜÉÉ½È Ù•Éä¹Ñ•ÉÁÉ¥Í”½µµ…¹µÕÍĞÉ•ÅÕ¥É”•áÁ±¥¥Ğ…¹½¹¥…°É•Í½ÕÉ”¥‘•¹Ñ¥Ñä…¹•á…Ğ±¥¹•…”•ÅÕ…±¥Ñä¸œ¤ì)ô)¥˜€ …É•Ù¥•İÕÑ¡½É¥Ñå½ÉÉ•Ñ¥½¸¹¥¹±Õ‘•Ì ˆ…ÁÁÉ½Ù…°¹É•Ù¥•Ü¹É•½Éœ°€½µµ…¹œ°Á}É•Í½ÕÉ•}¥°É•ÍÕ±Ğ°€½µµ¥ÑÑ•œˆ¤¤ì(€Ñ¡É½Ü¹•ÜÉÉ½È I•Ù¥•Ü•™™•ÑÌµÕÍĞ©½ÕÉ¹…°Ñ¡”É•Ù¥•İ•É•Í½ÕÉ”°¹½ĞÑ¡”É•Ù¥•Üµ•Ù•¹ĞÉ½Ü¸œ¤ì)ô)½¹ÍĞ‰É½İÍ•É±¥•¹Ğ€ôÉ•… Í•ÉÙ¥•Ì½•¹Ñ•ÉÁÉ¥Í•%¹Ñ•±±¥•¹•±¥•¹Ğ¹ÑÌœ¤ì4)™½È€¡½¹ÍĞÉ•ÅÕ¥É•½˜lÕ¹Ñ¥½¹Í•Ñ¡ÉÉ½Èœ°€Õ¹Ñ¥½¹ÍI•±…åÉÉ½Èœ°€¥ÍI•ÑÉå…‰±•QÉ…¹ÍÁ½ÉÑÉÉ½È¡¥¹Ù½…Ñ¥½¸¹•ÉÉ½È¤t¤ì4(€¥˜€ …‰É½İÍ•É±¥•¹Ğ¹¥¹±Õ‘•Ì¡É•ÅÕ¥É•¤¤Ñ¡É½Ü¹•ÜÉÉ½È¡	É½İÍ•ÈÉ•ÑÉä½¹ÑÉ…Ğ¥Ìµ¥ÍÍ¥¹œ€‘íÉ•ÅÕ¥É•‘ô¹€¤ì4)ô4)¥˜€ ½¥˜p¡¥¹Ù½…Ñ¥½¹p¹•ÉÉ½Ép¤¥¹Ù½…Ñ¥½¸€ô…İ…¥ĞÍÕÁ…‰…Í•p¹™Õ¹Ñ¥½¹Íp¹¥¹Ù½­”½Ô¹Ñ•ÍĞ¡‰É½İÍ•É±¥•¹Ğ¤¤ì4(€Ñ¡É½Ü¹•ÜÉÉ½È 	É½İÍ•ÈÉ•ÑÉäµÕÍĞ¹½ĞÉ•Á±…ä…ÁÁ±¥…Ñ¥½¸µ±•Ù•°!QQ@™…¥±ÕÉ•Ì¸œ¤ì4)ô4(4)½¹Í½±”¹±½œ ¹Ñ•ÉÁÉ¥Í”%¹Ñ•±±¥•¹”Í½ÕÉ”µ‰½Õ¹‘…ÉäÍ…¸Á…ÍÍ•¸œ¤ì4(
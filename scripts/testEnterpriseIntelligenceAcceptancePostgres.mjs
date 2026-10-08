import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import pg from 'pg';
import { createEnterpriseIntelligenceFixture } from './enterpriseIntelligencePostgresFixture.mjs';
import { applySyntheticAiTerminalJournalMigrationForTest } from './syntheticAiTerminalJournalMigrationTestGuard.mjs';
import {
  EI_ACCEPTANCE_EXACT_ACTUAL,
  EI_ACCEPTANCE_SCOPE,
  classifyEnterpriseIntelligenceAcceptanceCaseFailure,
  completeEnterpriseIntelligenceAcceptanceSetupBlocked,
  finalizeEnterpriseIntelligenceAcceptanceExecution,
  writeEnterpriseIntelligenceAcceptanceProducer,
} from './enterpriseIntelligenceAcceptanceEvidence.mjs';

const { Client } = pg;
const adminUrl = process.env.ENTERPRISE_INTELLIGENCE_ACCEPTANCE_DATABASE_URL;
const uuid = ordinal => `97200000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`;
const foreignOrg = '97100000-0000-4000-8000-000000000010';
const foreignWorkspace = '97100000-0000-4000-8000-000000000011';
const sizeLimitMigration = '20261008022445_enterprise_evidence_canonical_size_limit.sql';
const requiredMigrations = [
  '20260804120000_enterprise_intelligence_authority.sql',
  '20260805140000_enterprise_intelligence_ready_review_corrections.sql',
  '20261003055918_synthetic_ai_terminal_effect_journal_reconciliation.sql',
  sizeLimitMigration,
];
const dbName = `ei_accept_${process.pid}_${Date.now()}`;
const createdRoles = [];
const cleanupErrors = [];
const actualByTestId = {};
const failuresByTestId = {};
const blockedByTestId = {};
let admin;
let db;
let fixture;
let parserActual;
let parserTempDirectory;
let databaseCreated = false;
let activeCasePhase = 'not-started';
let setupFailurePhase = null;

const parserOutputRoot = resolve('output', 'test-runs', 'enterprise-intelligence-acceptance-parser');
const checkedParserRoot = async () => {
  const workspace = await realpath(process.cwd());
  const root = await realpath(parserOutputRoot);
  const location = relative(workspace, root);
  assert.ok(location && location !== '..' && !location.startsWith(`..${sep}`) && !isAbsolute(location));
  return root;
};
const removeParserOutput = async () => {
  const root = await checkedParserRoot();
  const target = await realpath(parserTempDirectory);
  assert.equal(dirname(target), root);
  assert.ok(basename(target).startsWith('run-'));
  assert.equal((await lstat(parserTempDirectory)).isSymbolicLink(), false);
  await rm(target, { recursive: true, force: false });
  parserTempDirectory = null;
};

const urlFor = name => {
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.toString();
};
const connect = async url => {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 10000 });
  await client.connect();
  return client;
};
const migrationTransaction = async (client, label, sql) => {
  await client.query('BEGIN');
  try {
    await client.query(sql.replaceAll('\r\n', '\n'));
    await client.query('COMMIT');
    console.log(`MIGRATION PASS ${label}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
};
const row = async (client, sql, parameters = []) => (await client.query(sql, parameters)).rows[0];
const count = async (client, sql, parameters = []) => Number((await client.query(sql, parameters)).rows[0].n);
const markPhase = phase => { activeCasePhase = phase; };

const boundaryCall = async (client, role, boundary, operation) => {
  assert.match(boundary, /^[a-z_]+$/u);
  assert.ok(['service_role', 'authenticated', 'anon'].includes(role));
  await client.query(`SAVEPOINT ${boundary}`);
  await client.query(`SET LOCAL ROLE ${role}`);
  try {
    const result = await operation();
    await client.query('RESET ROLE');
    await client.query(`RELEASE SAVEPOINT ${boundary}`);
    return result;
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${boundary}`);
    await client.query('RESET ROLE');
    await client.query(`RELEASE SAVEPOINT ${boundary}`);
    throw error;
  }
};
const serviceCall = (client, operation) => boundaryCall(client, 'service_role', 'ei_service_boundary', operation);
const authenticatedCall = (client, actorId, operation) => boundaryCall(
  client,
  'authenticated',
  'ei_authenticated_boundary',
  async () => {
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [actorId]);
    return operation();
  },
);
const anonymousCall = (client, operation) => boundaryCall(
  client,
  'anon',
  'ei_anonymous_boundary',
  async () => {
    await client.query("SELECT set_config('request.jwt.claim.sub','',true)");
    return operation();
  },
);
const expectRejectedWithoutEffect = async (client, label, operation, pattern, fingerprint) => {
  assert.match(label, /^[a-z_][a-z0-9_]*$/u);
  const before = await fingerprint();
  await client.query(`SAVEPOINT ${label}`);
  let rejected = false;
  try {
    await operation();
  } catch (error) {
    rejected = pattern.test(error instanceof Error ? error.message : String(error));
  }
  if (!rejected) {
    await client.query(`ROLLBACK TO SAVEPOINT ${label}`);
    await client.query(`RELEASE SAVEPOINT ${label}`);
    assert.fail(`expected ${label} rejection`);
  }
  const after = await fingerprint();
  try {
    assert.deepEqual(after, before);
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${label}`);
    await client.query(`RELEASE SAVEPOINT ${label}`);
    throw error;
  }
  await client.query(`RELEASE SAVEPOINT ${label}`);
  return true;
};
const authorizationVersion = async (client, orgId, actorId) => Number((await row(
  client,
  'SELECT version FROM public.authorization_versions WHERE org_id=$1::uuid AND user_id=$2::uuid',
  [orgId, actorId],
)).version);
const serverHash = async (client, value) => (await row(
  client, 'SELECT public.enterprise_sha256_jsonb($1::jsonb) value', [JSON.stringify(value)],
)).value;
const providerDisabled = async client => (await row(
  client, `SELECT NOT enterprise.provider_enabled AND NOT studio.provider_enabled value
    FROM public.enterprise_intelligence_runtime_control enterprise
    CROSS JOIN public.studio_artifact_runtime_control studio
    WHERE enterprise.singleton AND studio.singleton`,
)).value;

const providerFootprint = async (client, orgId, workspaceId) => ({
  jobs: await count(client,
    'SELECT count(*) n FROM public.enterprise_ai_job_ledger WHERE org_id=$1 AND workspace_id=$2',
    [orgId, workspaceId]),
  usage: await count(client,
    'SELECT count(*) n FROM public.enterprise_ai_usage_ledger WHERE org_id=$1 AND workspace_id=$2',
    [orgId, workspaceId]),
  reservations: await count(client,
    'SELECT count(*) n FROM public.enterprise_ai_budget_reservations WHERE org_id=$1 AND workspace_id=$2',
    [orgId, workspaceId]),
});
const footprintDelta = (before, after) => Object.keys(before)
  .reduce((total, key) => total + after[key] - before[key], 0);

const targetCounts = async (client, orgId, workspaceId, commandType) => ({
  sources: await count(client,
    'SELECT count(*) n FROM public.enterprise_evidence_sources WHERE org_id=$1 AND workspace_id=$2',
    [orgId, workspaceId]),
  versions: await count(client,
    'SELECT count(*) n FROM public.enterprise_evidence_source_versions WHERE org_id=$1 AND workspace_id=$2',
    [orgId, workspaceId]),
  blueprints: await count(client,
    'SELECT count(*) n FROM public.enterprise_assemble_blueprints WHERE org_id=$1 AND workspace_id=$2',
    [orgId, workspaceId]),
  receipts: await count(client,
    'SELECT count(*) n FROM public.enterprise_ai_command_receipts WHERE org_id=$1 AND workspace_id=$2 AND command_type=$3',
    [orgId, workspaceId, commandType]),
  effects: await count(client,
    `SELECT count(*) n FROM public.enterprise_ai_effect_journal effect
     JOIN public.enterprise_ai_command_receipts receipt ON receipt.id=effect.receipt_id
     WHERE receipt.org_id=$1 AND receipt.workspace_id=$2 AND receipt.command_type=$3`,
    [orgId, workspaceId, commandType]),
  replays: await count(client,
    `SELECT count(*) n FROM public.enterprise_ai_receipt_replay_requests replay
     JOIN public.enterprise_ai_command_receipts receipt ON receipt.id=replay.receipt_id
     WHERE receipt.org_id=$1 AND receipt.workspace_id=$2 AND receipt.command_type=$3`,
    [orgId, workspaceId, commandType]),
});

const targetFingerprint = async (client, orgId, workspaceId) => {
  const relations = [
    'enterprise_evidence_sources', 'enterprise_evidence_source_versions',
    'enterprise_ai_command_receipts', 'enterprise_ai_effect_journal',
    'enterprise_ai_receipt_replay_requests', 'enterprise_assemble_blueprints',
    'enterprise_ai_job_ledger', 'enterprise_ai_usage_ledger', 'enterprise_ai_budget_reservations',
  ];
  const values = {};
  for (const relation of relations) {
    let sql;
    if (relation === 'enterprise_ai_effect_journal') {
      sql = `SELECT to_jsonb(target) value FROM public.enterprise_ai_effect_journal target
        WHERE target.org_id=$1 AND target.workspace_id=$2 ORDER BY target.id`;
    } else if (relation === 'enterprise_ai_receipt_replay_requests') {
      sql = `SELECT to_jsonb(target) value FROM public.enterprise_ai_receipt_replay_requests target
        JOIN public.enterprise_ai_command_receipts receipt ON receipt.id=target.receipt_id
        WHERE receipt.org_id=$1 AND receipt.workspace_id=$2 ORDER BY target.receipt_id,target.request_id`;
    } else {
      sql = `SELECT to_jsonb(target) value FROM public.${relation} target
        WHERE target.org_id=$1 AND target.workspace_id=$2 ORDER BY target.id`;
    }
    const rows = (await client.query(sql, [orgId, workspaceId])).rows.map(item => item.value);
    values[relation] = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  }
  return values;
};

const assertAuthority = async (client, actorId, orgId, workspaceId, capability, version) => serviceCall(
  client,
  () => client.query(
    'SELECT public.pr1b_assert_command_authority($1,$2,$3,$4,$5)',
    [actorId, orgId, workspaceId, capability, version],
  ),
);

const authorityPrivilege = async (client, role) => (await row(
  client,
  `SELECT has_function_privilege(
    $1,'public.pr1b_assert_command_authority(uuid,uuid,uuid,text,bigint)','EXECUTE'
  ) allowed`,
  [role],
)).allowed;

const assertBrowserAuthorityDenied = async (client, actorId, orgId, workspaceId, capability, version) => {
  const fingerprint = () => targetFingerprint(client, orgId, workspaceId);
  const authenticatedDenied = await expectRejectedWithoutEffect(client, 'ei_browser_authenticated',
    () => authenticatedCall(client, actorId, () => client.query(
      'SELECT public.pr1b_assert_command_authority($1,$2,$3,$4,$5)',
      [actorId, orgId, workspaceId, capability, version],
    )), /permission denied|does not exist/u, fingerprint);
  const anonymousDenied = await expectRejectedWithoutEffect(client, 'ei_browser_anon',
    () => anonymousCall(client, () => client.query(
      'SELECT public.pr1b_assert_command_authority($1,$2,$3,$4,$5)',
      [actorId, orgId, workspaceId, capability, version],
    )), /permission denied|does not exist/u, fingerprint);
  return authenticatedDenied && anonymousDenied;
};

const assertStaleAndRemovedMembershipDenied = async (client, actorId, orgId, workspaceId, capability, version) => {
  const before = await targetFingerprint(client, orgId, workspaceId);
  await client.query('SAVEPOINT ei_authority_version_denials');
  try {
    const bumped = await client.query(
      `UPDATE public.workspace_memberships SET status=status
       WHERE user_id=$1 AND org_id=$2 AND workspace_id=$3`,
      [actorId, orgId, workspaceId],
    );
    assert.equal(bumped.rowCount, 1);
    const currentVersion = await authorizationVersion(client, orgId, actorId);
    assert.ok(currentVersion > version);
    await assert.rejects(
      assertAuthority(client, actorId, orgId, workspaceId, capability, version),
      /PR1B_AUTHORIZATION_STALE/u,
    );
    await assertAuthority(client, actorId, orgId, workspaceId, capability, currentVersion);
    assert.deepEqual(await targetFingerprint(client, orgId, workspaceId), before);
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT ei_authority_version_denials');
    await client.query('RELEASE SAVEPOINT ei_authority_version_denials');
  }

  await client.query('SAVEPOINT ei_membership_denial');
  try {
    const removed = await client.query(
      `DELETE FROM public.workspace_memberships
       WHERE user_id=$1 AND org_id=$2 AND workspace_id=$3`,
      [actorId, orgId, workspaceId],
    );
    assert.equal(removed.rowCount, 1);
    const removedVersion = await authorizationVersion(client, orgId, actorId);
    assert.ok(removedVersion > version);
    await assert.rejects(
      assertAuthority(client, actorId, orgId, workspaceId, capability, removedVersion),
      /PR1B_NOT_FOUND/u,
    );
    assert.deepEqual(await targetFingerprint(client, orgId, workspaceId), before);
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT ei_membership_denial');
    await client.query('RELEASE SAVEPOINT ei_membership_denial');
  }
  return true;
};

const insertHistoricalOversizedSource = async client => {
  const sourceId = uuid(901);
  const sourceVersionId = uuid(902);
  const contentHash = '9'.repeat(64);
  const contentBytes = 12_000_001;
  const parserKind = 'text_native';
  const parserVersion = 'enterprise-parser-1';
  const provenanceHash = await serverHash(client, {
    sourceId, sourceVersionId, version: 1,
    organizationId: fixture.org, workspaceId: fixture.workspace,
    mimeType: 'text/plain', contentHash, contentBytes, parserKind, parserVersion,
  });
  await client.query(
    `INSERT INTO public.enterprise_evidence_sources(
      id,org_id,workspace_id,display_name,source_kind,mime_type,current_version,status,created_by
    ) VALUES($1,$2,$3,'EI predecessor oversized history','upload','text/plain',1,'uploaded',$4)`,
    [sourceId, fixture.org, fixture.workspace, fixture.requester],
  );
  await client.query(
    `INSERT INTO public.enterprise_evidence_source_versions(
      id,source_id,org_id,workspace_id,version,original_filename,content_hash,content_bytes,
      storage_bucket,storage_path,extracted_text_hash,extracted_character_count,
      parser_kind,parser_version,provenance_hash,created_by
    ) VALUES($1,$2,$3,$4,1,'predecessor-oversized.txt',$5,12000001,
      'source-uploads',$6,NULL,NULL,$7,$8,$9,$10)`,
    [sourceVersionId, sourceId, fixture.org, fixture.workspace, contentHash,
      `${fixture.org}/${fixture.workspace}/enterprise-evidence/${sourceId}.bin`,
      parserKind, parserVersion, provenanceHash, fixture.requester],
  );
};

const runSourceCommand = async (client, options) => {
  const orgId = options.orgId ?? fixture.org;
  const workspaceId = options.workspaceId ?? fixture.workspace;
  const actorId = options.actorId ?? fixture.requester;
  const storagePath = options.storagePath
    ?? `${orgId}/${workspaceId}/enterprise-evidence/${options.sourceId}.bin`;
  const source = {
    id: options.sourceId, org_id: orgId, workspace_id: workspaceId,
    display_name: options.displayName ?? 'Enterprise Intelligence acceptance evidence',
    source_kind: 'upload', mime_type: options.mimeType ?? parserActual.mimeType,
    created_by: actorId,
  };
  const version = {
    id: options.sourceVersionId, source_id: options.sourceId,
    org_id: orgId, workspace_id: workspaceId,
    original_filename: options.originalFilename ?? 'acceptance.txt',
    content_hash: options.contentHash ?? parserActual.contentHash,
    content_bytes: options.contentBytes ?? parserActual.contentBytes,
    storage_bucket: options.storageBucket ?? 'source-uploads', storage_path: storagePath,
    extracted_text_hash: null, extracted_character_count: null, created_by: actorId,
  };
  const requestPayload = {
    sourceId: options.sourceId, sourceVersionId: options.sourceVersionId,
    contentHash: version.content_hash, contentBytes: version.content_bytes,
    mimeType: source.mime_type,
  };
  const requestHash = await serverHash(client, requestPayload);
  await assertAuthority(client, actorId, orgId, workspaceId, 'evidence.write', options.authorizationVersion);
  const receipt = (await serviceCall(client, () => client.query(
    `SELECT * FROM public.enterprise_ai_claim_command(
      $1,$2,$3,'evidence.source.create',$4,$5,$6,NULL,$7
    )`,
    [actorId, orgId, workspaceId, options.idempotencyKey, options.requestId, requestHash, options.executionToken],
  ))).rows[0];
  await serviceCall(client, () => client.query(
    'SELECT public.enterprise_ai_plan_command($1,$2,$3,$4,$5,$6::jsonb)',
    [receipt.id, orgId, workspaceId, receipt.execution_token, receipt.execution_fence, JSON.stringify({
      storageWriteOwnership: 'synthetic_disposable_fixture',
      storageWriteReceiptId: receipt.id,
      sourceId: options.sourceId, sourceVersionId: options.sourceVersionId,
      storageBucket: version.storage_bucket, storagePath,
      contentHash: version.content_hash, contentBytes: version.content_bytes,
      mimeType: source.mime_type, writeState: 'not_executed',
    })],
  ));
  const pendingResult = {
    sourceId: options.sourceId, sourceVersionId: options.sourceVersionId,
    status: 'uploaded', extractedCharacterCount: 0,
  };
  await serviceCall(client, () => client.query(
    'SELECT public.enterprise_create_evidence_source_record($1::jsonb,$2::jsonb,$3,$4,$5,$6::jsonb)',
    [JSON.stringify(source), JSON.stringify(version), receipt.id, receipt.execution_token,
      receipt.execution_fence, JSON.stringify(pendingResult)],
  ));
  const finalResult = {
    sourceId: options.sourceId, sourceVersionId: options.sourceVersionId,
    status: 'parsed', extractedCharacterCount: parserActual.extractedCharacterCount,
  };
  await serviceCall(client, () => client.query(
    `SELECT public.enterprise_record_source_extraction_success(
      $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb
    )`,
    [options.sourceVersionId, orgId, workspaceId, parserActual.extractedTextHash,
      parserActual.extractedCharacterCount, receipt.id, receipt.execution_token,
      receipt.execution_fence, JSON.stringify(finalResult)],
  ));
  const completed = (await serviceCall(client, () => client.query(
    'SELECT * FROM public.enterprise_ai_complete_command($1,$2,$3,$4,$5,$6::jsonb,$7)',
    [receipt.id, orgId, workspaceId, receipt.execution_token, receipt.execution_fence,
      JSON.stringify(finalResult), options.sourceId],
  ))).rows[0];
  return { receipt: completed, requestHash, source, version, finalResult };
};

// Negative persistence checks call the receipt-aware mutation as one SQL
// statement. PostgreSQL must reject the source/version before journal lookup,
// leaving no target row for the harness to erase.
const attemptRejectedSourceRecord = async (client, options) => {
  const source = {
    id: options.sourceId, org_id: fixture.org, workspace_id: fixture.workspace,
    display_name: 'Rejected Enterprise Intelligence acceptance evidence',
    source_kind: 'upload', mime_type: options.mimeType ?? parserActual.mimeType,
    created_by: fixture.requester,
  };
  const version = {
    id: options.sourceVersionId, source_id: options.sourceId,
    org_id: fixture.org, workspace_id: fixture.workspace,
    original_filename: 'rejected.txt', content_hash: parserActual.contentHash,
    content_bytes: options.contentBytes ?? parserActual.contentBytes,
    storage_bucket: options.storageBucket ?? 'source-uploads',
    storage_path: options.storagePath
      ?? `${fixture.org}/${fixture.workspace}/enterprise-evidence/${options.sourceId}.bin`,
    extracted_text_hash: null, extracted_character_count: null,
    created_by: fixture.requester,
  };
  return serviceCall(client, () => client.query(
    'SELECT public.enterprise_create_evidence_source_record($1::jsonb,$2::jsonb,$3,$4,1,$5::jsonb)',
    [JSON.stringify(source), JSON.stringify(version), uuid(options.ordinal),
      uuid(options.ordinal + 1), JSON.stringify({ status: 'rejected-input' })],
  ));
};

const replayCommand = async (client, command, authorization, capability = 'evidence.write') => {
  await assertAuthority(client, command.actorId, command.orgId, command.workspaceId, capability, authorization);
  return (await serviceCall(client, () => client.query(
    `SELECT * FROM public.enterprise_ai_claim_command(
      $1,$2,$3,$4,$5,$6,$7,NULL,$8
    )`,
    [command.actorId, command.orgId, command.workspaceId, command.commandType,
      command.idempotencyKey, command.requestId, command.requestHash, command.executionToken],
  ))).rows[0];
};

const inspectSource = async (client, sourceId, sourceVersionId) => {
  const source = await row(client,
    `SELECT id,org_id,workspace_id,current_version,status,mime_type
     FROM public.enterprise_evidence_sources WHERE id=$1`, [sourceId]);
  const version = await row(client,
    `SELECT id,source_id,org_id,workspace_id,version,content_hash,content_bytes,
      storage_bucket,storage_path,extracted_text_hash,extracted_character_count,
      extraction_status,parser_kind,parser_version,provenance_hash
     FROM public.enterprise_evidence_source_versions WHERE id=$1`, [sourceVersionId]);
  return { source, version };
};

const seedApprovedModernizationDecision = async (client, ordinal) => {
  const application = uuid(ordinal + 1);
  const metadata = uuid(ordinal + 2);
  const sourceAssessment = uuid(ordinal + 3);
  const assessment = uuid(ordinal + 4);
  const decision = uuid(ordinal + 5);
  const review = uuid(ordinal + 6);
  await client.query(
    `INSERT INTO public.assess_application_assets(id,org_id,workspace_id,name,normalized_name,created_by)
     VALUES($1,$2,$3,'EI acceptance application','ei acceptance application',$4)`,
    [application, fixture.org, fixture.workspace, fixture.requester],
  );
  await client.query(
    `INSERT INTO public.assess_application_metadata_versions(
      id,org_id,workspace_id,application_id,version,lifecycle,metadata,author_id
     ) VALUES($1,$2,$3,$4,1,'approved','{}'::jsonb,$5)`,
    [metadata, fixture.org, fixture.workspace, application, fixture.requester],
  );
  const authVersion = await authorizationVersion(client, fixture.org, fixture.requester);
  await client.query(
    `INSERT INTO public.assess_application_assessment_versions(
      id,org_id,workspace_id,application_id,metadata_version_id,version,
      decision_model_version,lifecycle,author_id,authorization_version
     ) VALUES($1,$2,$3,$4,$5,1,'assess-v2-application-portfolio-2026-07','approved',$6,$7)`,
    [sourceAssessment, fixture.org, fixture.workspace, application, metadata,
      fixture.requester, authVersion],
  );
  const dimensions = [
    'integration_accessibility', 'semantic_and_data_clarity', 'state_and_execution',
    'security_and_control', 'architecture_changeability', 'ui_automation_readiness',
    'ai_assisted_engineering_readiness',
  ];
  await client.query(
    `INSERT INTO public.assess_application_dimension_results(
      org_id,workspace_id,application_id,metadata_version_id,assessment_version_id,
      dimension,readiness_band,evidence_confidence,hard_gates,evidence_refs,
      missing_evidence,rationale,contradictions,remediation_requirements,what_would_change
     ) SELECT $1,$2,$3,$4,$5,dimension,'Ready','Verified','{}'::text[],'[]'::jsonb,
       '{}'::text[],ARRAY['verified'],'{}'::text[],'{}'::text[],ARRAY['new evidence']
       FROM unnest($6::text[]) dimension`,
    [fixture.org, fixture.workspace, application, metadata, sourceAssessment, dimensions],
  );
  await client.query(
    `INSERT INTO public.assess_application_modernization_recommendations(
      org_id,workspace_id,application_id,metadata_version_id,assessment_version_id,
      disposition,migration_boundary,rollback_strategy,evidence_confidence
     ) VALUES($1,$2,$3,$4,$5,'Rebuild through controlled AI-assisted delivery',
       'draft-only boundary','retain current system','Verified')`,
    [fixture.org, fixture.workspace, application, metadata, sourceAssessment],
  );
  await client.query(
    'SELECT public.enterprise_commit_modernization_assessment($1::jsonb,$2::jsonb)',
    [JSON.stringify({
      id: assessment, org_id: fixture.org, workspace_id: fixture.workspace,
      application_ref: application, source_assessment_id: sourceAssessment,
      source_metadata_version_id: metadata, created_by: fixture.requester,
    }), JSON.stringify({ id: decision, created_by: fixture.requester })],
  );
  const decisionRow = await row(client,
    'SELECT resource_hash FROM public.enterprise_modernization_decisions WHERE id=$1', [decision]);
  const reviewerVersion = await authorizationVersion(client, fixture.org, fixture.reviewer);
  await client.query(
    `INSERT INTO public.enterprise_high_impact_review_events(
      id,org_id,workspace_id,resource_type,resource_id,reviewer_id,
      reviewer_authorization_version,resource_version,resource_hash,outcome,rationale
     ) VALUES($1,$2,$3,'modernization_decision',$4,$5,$6,1,$7,'approved',
       'Independent synthetic modernization review')`,
    [review, fixture.org, fixture.workspace, decision, fixture.reviewer,
      reviewerVersion, decisionRow.resource_hash],
  );
  await client.query(
    `SELECT public.enterprise_commit_high_impact_approval(
      $1::jsonb,'modernization_decision',$2,$3,$4,'approved'
    )`,
    [JSON.stringify({
      created_by: fixture.requester, reviewed_by: fixture.reviewer,
      approved_by: fixture.approver, review_event_id: review,
      outcome: 'approved', rationale: 'Synthetic modernization approval',
    }), decision, fixture.org, fixture.workspace],
  );
  return decision;
};

const runCase = async (testId, operation) => {
  activeCasePhase = 'setup-case-transaction';
  await db.query('BEGIN');
  try {
    const actual = await operation();
    assert.deepEqual(actual, EI_ACCEPTANCE_EXACT_ACTUAL[testId]);
    actualByTestId[testId] = actual;
    console.log(`PASS ${testId}`);
  } catch {
    const failure = classifyEnterpriseIntelligenceAcceptanceCaseFailure(activeCasePhase);
    const target = failure.status === 'BLOCKED' ? blockedByTestId : failuresByTestId;
    target[testId] = { failureCode: failure.failureCode };
    console.error(`${failure.status} ${testId} phase=${activeCasePhase} ${failure.failureCode}`);
  } finally {
    try { await db.query('ROLLBACK'); } catch { cleanupErrors.push(`case-rollback:${testId}`); }
  }
};

activeCasePhase = 'setup-foundation-config';
try {
  assert.ok(adminUrl, 'ENTERPRISE_INTELLIGENCE_ACCEPTANCE_DATABASE_URL is required.');
  const localTarget = new URL(adminUrl);
  assert.ok(['postgres:', 'postgresql:'].includes(localTarget.protocol));
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(localTarget.hostname),
    'Enterprise Intelligence acceptance requires loopback disposable PostgreSQL.');
  const migrations = (await readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
  for (const migration of requiredMigrations) assert.ok(migrations.includes(migration), `missing ${migration}`);
  for (let index = 1; index < requiredMigrations.length; index += 1) {
    assert.ok(migrations.indexOf(requiredMigrations[index]) > migrations.indexOf(requiredMigrations[index - 1]));
  }

  activeCasePhase = 'setup-production-parser';
  await mkdir(parserOutputRoot, { recursive: true });
  parserTempDirectory = await mkdtemp(join(await checkedParserRoot(), 'run-'));
  const parserResultPath = join(parserTempDirectory, 'parser-result.json');
  execFileSync(process.execPath, [
    'scripts/runEnterpriseIntelligenceTest.mjs',
    'services/enterpriseIntelligence.ts',
    'supabase/functions/_shared/enterpriseIntelligenceIngestion.ts',
    'scripts/enterpriseIntelligenceAcceptanceParser.test.ts',
  ], {
    stdio: 'inherit',
    env: { ...process.env, EI_ACCEPTANCE_PARSER_RESULT_PATH: parserResultPath },
  });
  parserActual = JSON.parse(await readFile(parserResultPath, 'utf8'));
  assert.deepEqual(parserActual, {
    maximumBytes: 12_000_000, oversizeBytes: 12_000_001,
    maximumAccepted: true, oversizeRejected: true,
    unsupportedMimeRejected: true, mimeType: 'text/plain',
    contentBytes: 12_000_000,
    contentHash: parserActual.contentHash,
    extractedTextHash: parserActual.extractedTextHash,
    extractedCharacterCount: 8,
  });
  assert.match(parserActual.contentHash, /^[0-9a-f]{64}$/u);
  assert.match(parserActual.extractedTextHash, /^[0-9a-f]{64}$/u);
  assert.notEqual(parserActual.extractedTextHash, parserActual.contentHash);
  await removeParserOutput();

  activeCasePhase = 'setup-foundation-connect';
  admin = await connect(adminUrl);
  activeCasePhase = 'setup-foundation-roles';
  for (const [roleName, attributes] of [
    ['anon', 'NOLOGIN'], ['authenticated', 'NOLOGIN'], ['service_role', 'NOLOGIN BYPASSRLS'],
  ]) {
    if (!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [roleName])).rowCount) {
      await admin.query(`CREATE ROLE ${roleName} ${attributes}`);
      createdRoles.push(roleName);
    }
  }
  assert.match(dbName, /^[a-z0-9_]+$/u);
  if ((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [dbName])).rowCount) {
    throw new Error('refusing to overwrite an existing Enterprise Intelligence acceptance database');
  }
  await admin.query(`CREATE DATABASE ${dbName}`);
  databaseCreated = true;
  db = await connect(urlFor(dbName));
  activeCasePhase = 'setup-foundation-migrations';
  await migrationTransaction(db, 'auth-bootstrap', `
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  `);
  assert.equal(migrations.at(-1), sizeLimitMigration);
  for (const migration of migrations) {
    if (migration === sizeLimitMigration) continue;
    const sql = await readFile(join('supabase/migrations', migration), 'utf8');
    await applySyntheticAiTerminalJournalMigrationForTest(db, migration,
      () => migrationTransaction(db, migration, sql));
  }

  // Exercise the exact successor from its predecessor, before fixture rows exist.
  const sizeSql = await readFile(join('supabase/migrations', sizeLimitMigration), 'utf8');
  assert.equal(await authorityPrivilege(db, 'service_role'), false);
  assert.equal(await authorityPrivilege(db, 'authenticated'), false);
  assert.equal(await authorityPrivilege(db, 'anon'), false);
  activeCasePhase = 'setup-empty-size-upgrade';
  await db.query('BEGIN');
  try {
    await db.query(sizeSql);
    assert.equal((await row(db, 'SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton')).migration_tip, '20261008022445');
    assert.equal(await authorityPrivilege(db, 'service_role'), true);
    assert.equal(await authorityPrivilege(db, 'authenticated'), false);
    assert.equal(await authorityPrivilege(db, 'anon'), false);
  } finally { await db.query('ROLLBACK'); }
  assert.equal(await authorityPrivilege(db, 'service_role'), false);

  // Shared SQL-only prerequisites simulate completed provider output. They make
  // no HTTP/provider call and are not target mutations. Disable both runtimes
  // immediately after constructing them, before upgrade proof and all EI cases.
  activeCasePhase = 'setup-foundation-fixture';
  fixture = await createEnterpriseIntelligenceFixture(db);
  assert.equal(fixture.org, EI_ACCEPTANCE_SCOPE.organizationId);
  assert.equal(fixture.workspace, EI_ACCEPTANCE_SCOPE.workspaceId);
  await db.query('UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=false WHERE singleton');
  await db.query('UPDATE public.studio_artifact_runtime_control SET provider_enabled=false WHERE singleton');
  assert.equal(await providerDisabled(db), true);
  await db.query("INSERT INTO public.organizations(id,name,slug) VALUES($1,'EI foreign acceptance','ei-foreign-acceptance')", [foreignOrg]);
  await db.query("INSERT INTO public.workspaces(id,org_id,name,slug) VALUES($1,$2,'EI foreign acceptance','ei-foreign-acceptance')", [foreignWorkspace, foreignOrg]);

  activeCasePhase = 'setup-compatible-size-upgrade';
  const compatibleBefore = await targetFingerprint(db, fixture.org, fixture.workspace);
  await db.query('BEGIN');
  try {
    await db.query(sizeSql);
    assert.deepEqual(await targetFingerprint(db, fixture.org, fixture.workspace), compatibleBefore);
  } finally { await db.query('ROLLBACK'); }

  activeCasePhase = 'setup-incompatible-size-upgrade';
  await db.query('BEGIN');
  try {
    // Predecessor-only history prerequisite. This owner-level fixture write is
    // rolled back and is not evidence for any target acceptance operation.
    await insertHistoricalOversizedSource(db);
    const incompatibleBefore = await targetFingerprint(db, fixture.org, fixture.workspace);
    await db.query('SAVEPOINT size_migration_attempt');
    await assert.rejects(db.query(sizeSql), /ENTERPRISE_SOURCE_SIZE_HISTORY_REQUIRES_REVIEW/u);
    await db.query('ROLLBACK TO SAVEPOINT size_migration_attempt');
    await db.query('RELEASE SAVEPOINT size_migration_attempt');
    assert.equal(await authorityPrivilege(db, 'service_role'), false);
    assert.deepEqual(await targetFingerprint(db, fixture.org, fixture.workspace), incompatibleBefore);
    const oldConstraint = await row(db, `SELECT pg_get_constraintdef(oid) definition
      FROM pg_constraint WHERE conrelid='public.enterprise_evidence_source_versions'::regclass
        AND conname='enterprise_evidence_source_versions_content_bytes_check'`);
    assert.match(oldConstraint.definition, /12582912/u);
    assert.equal(Number((await row(db, `SELECT count(*) n FROM pg_constraint
      WHERE conrelid='public.enterprise_evidence_source_versions'::regclass
        AND conname='enterprise_evidence_source_versions_size_limit_check'`)).n), 0);
    assert.equal((await row(db, 'SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton')).migration_tip, '20261004112232');
  } finally { await db.query('ROLLBACK'); }
  assert.deepEqual(await targetFingerprint(db, fixture.org, fixture.workspace), compatibleBefore);

  activeCasePhase = 'setup-current-size-upgrade';
  await migrationTransaction(db, sizeLimitMigration, sizeSql);
  const contentBytesConstraint = (await db.query(`SELECT pg_get_constraintdef(oid) definition
    FROM pg_constraint WHERE conrelid='public.enterprise_evidence_source_versions'::regclass
      AND pg_get_constraintdef(oid) LIKE '%content_bytes%'`)).rows.map(item => item.definition).join(' ');
  assert.match(contentBytesConstraint, /content_bytes\s*<=\s*12000000/u);
  assert.doesNotMatch(contentBytesConstraint, /12582912/u);
  assert.equal(await authorityPrivilege(db, 'service_role'), true);
  assert.equal(await authorityPrivilege(db, 'authenticated'), false);
  assert.equal(await authorityPrivilege(db, 'anon'), false);
  assert.equal((await row(db, "SELECT has_function_privilege('service_role','public.enterprise_create_evidence_source_record(jsonb,jsonb,uuid,uuid,bigint,jsonb)','EXECUTE') allowed")).allowed, true);
  assert.equal((await row(db, "SELECT has_function_privilege('authenticated','public.enterprise_create_evidence_source_record(jsonb,jsonb,uuid,uuid,bigint,jsonb)','EXECUTE') allowed")).allowed, false);
  assert.equal(await providerDisabled(db), true);
  console.log('FOUNDATION PASS full current chain; empty, compatible and incompatible size upgrades; SQL-only fixture');

  await runCase('EI-001', async () => {

    markPhase('canonical-boundary-source');
    const authVersion = await authorizationVersion(db, fixture.org, fixture.requester);
    const before = await targetCounts(db, fixture.org, fixture.workspace, 'evidence.source.create');
    const providerBefore = await providerFootprint(db, fixture.org, fixture.workspace);
    const committed = await runSourceCommand(db, {
      sourceId: uuid(1001), sourceVersionId: uuid(1002),
      requestId: uuid(1003), executionToken: uuid(1004),
      idempotencyKey: 'ei-001-canonical-maximum', authorizationVersion: authVersion,
      contentBytes: 12_000_000,
    });
    const after = await targetCounts(db, fixture.org, fixture.workspace, 'evidence.source.create');
    const inspected = await inspectSource(db, uuid(1001), uuid(1002));
    assert.equal(Number(inspected.version.content_bytes), 12_000_000);
    assert.equal(inspected.version.extraction_status, 'parsed');
    assert.equal(inspected.version.extracted_text_hash, parserActual.extractedTextHash);
    assert.equal(committed.receipt.status, 'committed');

    markPhase('authority-boundary-denials');
    assert.equal(await assertBrowserAuthorityDenied(db, fixture.requester, fixture.org,
      fixture.workspace, 'evidence.write', authVersion), true);
    assert.equal(await assertStaleAndRemovedMembershipDenied(db, fixture.requester, fixture.org,
      fixture.workspace, 'evidence.write', authVersion), true);

    markPhase('oversize-denial');
    const oversizeRejected = await expectRejectedWithoutEffect(db, 'ei_001_oversize',
      () => attemptRejectedSourceRecord(db, {
        sourceId: uuid(1011), sourceVersionId: uuid(1012), ordinal: 1013,
        contentBytes: 12_000_001,
      }), /content_bytes|check constraint/u,
      () => targetFingerprint(db, fixture.org, fixture.workspace));
    markPhase('mime-denial');
    const mimeRejected = await expectRejectedWithoutEffect(db, 'ei_001_mime',
      () => attemptRejectedSourceRecord(db, {
        sourceId: uuid(1021), sourceVersionId: uuid(1022), ordinal: 1023,
        mimeType: 'application/octet-stream',
      }), /mime_type|check constraint/u,
      () => targetFingerprint(db, fixture.org, fixture.workspace));
    markPhase('storage-binding-denial');
    const pathRejected = await expectRejectedWithoutEffect(db, 'ei_001_storage',
      () => attemptRejectedSourceRecord(db, {
        sourceId: uuid(1031), sourceVersionId: uuid(1032), ordinal: 1033,
        storagePath: 'wrong/path',
      }), /ENTERPRISE_EVIDENCE_STORAGE_BINDING_INVALID/u,
      () => targetFingerprint(db, fixture.org, fixture.workspace));
    const bucketRejected = await expectRejectedWithoutEffect(db, 'ei_001_bucket',
      () => attemptRejectedSourceRecord(db, {
        sourceId: uuid(1035), sourceVersionId: uuid(1036), ordinal: 1037,
        storageBucket: 'wrong-bucket',
      }), /storage_bucket|check constraint|ENTERPRISE_EVIDENCE_STORAGE_BINDING_INVALID/u,
      () => targetFingerprint(db, fixture.org, fixture.workspace));
    markPhase('foreign-tenant-denial');
    const foreignTenantDenied = await expectRejectedWithoutEffect(db, 'ei_001_foreign',
      () => assertAuthority(db, fixture.requester, foreignOrg, foreignWorkspace,
        'evidence.write', authVersion), /PR1B_NOT_FOUND|AUTHORIZATION/u,
      () => targetFingerprint(db, foreignOrg, foreignWorkspace));
    const providerAfter = await providerFootprint(db, fixture.org, fixture.workspace);
    return {
      logicalMutationCount: 1,
      sourceDelta: after.sources - before.sources,
      versionDelta: after.versions - before.versions,
      receiptDelta: after.receipts - before.receipts,
      effectDelta: after.effects - before.effects,
      canonicalMaximumAccepted: Number(inspected.version.content_bytes) === 12_000_000,
      compatibleHistoryPreserved: true, incompatibleHistoryRejected: true,
      oversizeRejected, mimeRejected,
      storageBindingRejected: pathRejected && bucketRejected,
      foreignTenantDenied,
      deniedEffectDelta: 0,
      extractionParsed: inspected.version.extraction_status === 'parsed',
      constraintExact: /content_bytes\s*<=\s*12000000/u.test(contentBytesConstraint),
      providerDisabled: await providerDisabled(db),
      providerEffectDelta: footprintDelta(providerBefore, providerAfter),
      hostedStorageNotRun: true,
      lineageBound: inspected.source.id === uuid(1001)
        && inspected.version.source_id === inspected.source.id
        && inspected.version.org_id === fixture.org
        && inspected.version.workspace_id === fixture.workspace,
    };
  });

  await runCase('EI-002', async () => {
    markPhase('source-lineage-commit');
    const authVersion = await authorizationVersion(db, fixture.org, fixture.requester);
    const before = await targetCounts(db, fixture.org, fixture.workspace, 'evidence.source.create');
    const providerBefore = await providerFootprint(db, fixture.org, fixture.workspace);
    await runSourceCommand(db, {
      sourceId: uuid(2001), sourceVersionId: uuid(2002), requestId: uuid(2003),
      executionToken: uuid(2004), idempotencyKey: 'ei-002-lineage-source',
      authorizationVersion: authVersion,
    });
    const after = await targetCounts(db, fixture.org, fixture.workspace, 'evidence.source.create');
    const inspected = await inspectSource(db, uuid(2001), uuid(2002));
    markPhase('safe-projection');
    const projection = (await authenticatedCall(db, fixture.requester, () => db.query(
      'SELECT public.enterprise_evidence_source_projection($1,$2,$3) value',
      [fixture.org, fixture.workspace, uuid(2001)],
    ))).rows[0].value;
    const foreignProjection = (await authenticatedCall(db, fixture.requester, () => db.query(
      'SELECT public.enterprise_evidence_source_projection($1,$2,$3) value',
      [foreignOrg, foreignWorkspace, uuid(2001)],
    ))).rows[0].value;
    const serializedProjection = JSON.stringify(projection);
    const expectedProvenanceHash = await serverHash(db, {
      sourceId: inspected.version.source_id,
      sourceVersionId: inspected.version.id,
      version: Number(inspected.version.version),
      organizationId: inspected.version.org_id,
      workspaceId: inspected.version.workspace_id,
      mimeType: inspected.source.mime_type,
      contentHash: inspected.version.content_hash,
      contentBytes: Number(inspected.version.content_bytes),
      parserKind: inspected.version.parser_kind,
      parserVersion: inspected.version.parser_version,
    });
    markPhase('immutable-source-version');
    const updateDenied = await expectRejectedWithoutEffect(db, 'ei_002_update',
      () => serviceCall(db, () => db.query(
        'UPDATE public.enterprise_evidence_source_versions SET content_hash=$1 WHERE id=$2',
        ['f'.repeat(64), uuid(2002)],
      )), /IMMUTABLE|immutable/u, () => targetFingerprint(db, fixture.org, fixture.workspace));
    const deleteDenied = await expectRejectedWithoutEffect(db, 'ei_002_delete',
      () => serviceCall(db, () => db.query(
        'DELETE FROM public.enterprise_evidence_source_versions WHERE id=$1', [uuid(2002)],
      )), /IMMUTABLE|immutable/u, () => targetFingerprint(db, fixture.org, fixture.workspace));
    return {
      logicalMutationCount: 1,
      sourceDelta: after.sources - before.sources,
      versionDelta: after.versions - before.versions,
      receiptDelta: after.receipts - before.receipts,
      effectDelta: after.effects - before.effects,
      currentVersionBound: Number(inspected.source.current_version) === Number(inspected.version.version),
      contentHashBound: inspected.version.content_hash === parserActual.contentHash,
      provenanceHashBound: inspected.version.provenance_hash === expectedProvenanceHash,
      lineageBound: inspected.version.source_id === inspected.source.id
        && inspected.version.org_id === inspected.source.org_id
        && inspected.version.workspace_id === inspected.source.workspace_id,
      projectionVisible: projection?.sourceId === uuid(2001),
      projectionRedacted: !serializedProjection.includes('storageBucket')
        && !serializedProjection.includes('storagePath')
        && !serializedProjection.includes('source-uploads'),
      foreignProjectionDenied: foreignProjection === null,
      immutable: updateDenied && deleteDenied,
      providerDisabled: await providerDisabled(db),
      providerJobUsageReservationDelta: footprintDelta(providerBefore,
        await providerFootprint(db, fixture.org, fixture.workspace)),
      hostedStorageNotRun: true,
    };
  });

  await runCase('EI-004', async () => {
    markPhase('source-command-commit');
    const authVersion = await authorizationVersion(db, fixture.org, fixture.requester);
    const before = await targetCounts(db, fixture.org, fixture.workspace, 'evidence.source.create');
    const providerBefore = await providerFootprint(db, fixture.org, fixture.workspace);
    const original = await runSourceCommand(db, {
      sourceId: uuid(4001), sourceVersionId: uuid(4002), requestId: uuid(4003),
      executionToken: uuid(4004), idempotencyKey: 'ei-004-idempotent-source',
      authorizationVersion: authVersion,
    });
    const after = await targetCounts(db, fixture.org, fixture.workspace, 'evidence.source.create');
    const replayBefore = await targetCounts(db, fixture.org, fixture.workspace, 'evidence.source.create');
    markPhase('exact-replay');
    const replay = await replayCommand(db, {
      actorId: fixture.requester, orgId: fixture.org, workspaceId: fixture.workspace,
      commandType: 'evidence.source.create', idempotencyKey: 'ei-004-idempotent-source',
      requestId: uuid(4005), requestHash: original.requestHash, executionToken: uuid(4006),
    }, authVersion);
    const replayAfter = await targetCounts(db, fixture.org, fixture.workspace, 'evidence.source.create');
    assert.equal(replay.id, original.receipt.id);
    assert.deepEqual(replay.response, original.receipt.response);
    markPhase('changed-payload-conflict');
    const changedPayloadConflict = await expectRejectedWithoutEffect(db, 'ei_004_conflict',
      () => replayCommand(db, {
        actorId: fixture.requester, orgId: fixture.org, workspaceId: fixture.workspace,
        commandType: 'evidence.source.create', idempotencyKey: 'ei-004-idempotent-source',
        requestId: uuid(4007), requestHash: 'f'.repeat(64), executionToken: uuid(4008),
      }, authVersion), /ENTERPRISE_AI_IDEMPOTENCY_CONFLICT/u,
      () => targetFingerprint(db, fixture.org, fixture.workspace));

    markPhase('revoked-authority');
    await db.query(
      "DELETE FROM public.role_capabilities WHERE role_id=$1 AND capability_key='evidence.write'",
      [fixture.role],
    );
    const revokedVersion = await authorizationVersion(db, fixture.org, fixture.requester);
    assert.ok(revokedVersion > authVersion);
    const revokedBefore = await targetFingerprint(db, fixture.org, fixture.workspace);
    const oldDenied = await expectRejectedWithoutEffect(db, 'ei_004_old_authority',
      () => replayCommand(db, {
        actorId: fixture.requester, orgId: fixture.org, workspaceId: fixture.workspace,
        commandType: 'evidence.source.create', idempotencyKey: 'ei-004-idempotent-source',
        requestId: uuid(4009), requestHash: original.requestHash, executionToken: uuid(4010),
      }, authVersion), /PR1B_NOT_FOUND|AUTHORIZATION/u,
      () => targetFingerprint(db, fixture.org, fixture.workspace));
    const currentDenied = await expectRejectedWithoutEffect(db, 'ei_004_current_authority',
      () => replayCommand(db, {
        actorId: fixture.requester, orgId: fixture.org, workspaceId: fixture.workspace,
        commandType: 'evidence.source.create', idempotencyKey: 'ei-004-idempotent-source',
        requestId: uuid(4011), requestHash: original.requestHash, executionToken: uuid(4012),
      }, revokedVersion), /PR1B_NOT_FOUND|AUTHORIZATION/u,
      () => targetFingerprint(db, fixture.org, fixture.workspace));
    const freshDenied = await expectRejectedWithoutEffect(db, 'ei_004_fresh_authority',
      () => replayCommand(db, {
        actorId: fixture.requester, orgId: fixture.org, workspaceId: fixture.workspace,
        commandType: 'evidence.source.create', idempotencyKey: 'ei-004-revoked-fresh',
        requestId: uuid(4013), requestHash: original.requestHash, executionToken: uuid(4014),
      }, revokedVersion), /PR1B_NOT_FOUND|AUTHORIZATION/u,
      () => targetFingerprint(db, fixture.org, fixture.workspace));
    const revokedAfter = await targetFingerprint(db, fixture.org, fixture.workspace);
    return {
      logicalMutationCount: 1,
      sourceDelta: after.sources - before.sources,
      versionDelta: after.versions - before.versions,
      receiptDelta: after.receipts - before.receipts,
      effectDelta: after.effects - before.effects,
      exactReplay: replay.status === 'committed',
      sameReceipt: replay.id === original.receipt.id,
      sameResource: replay.resource_id === uuid(4001)
        && isDeepStrictEqual(replay.response, original.receipt.response),
      replayProductMutationDelta: (replayAfter.sources - replayBefore.sources)
        + (replayAfter.versions - replayBefore.versions)
        + (replayAfter.effects - replayBefore.effects),
      correlationAttemptDelta: replayAfter.replays - replayBefore.replays,
      changedPayloadConflict,
      revokedAuthorityDenied: oldDenied && currentDenied && freshDenied,
      responseDisclosureDenied: oldDenied && currentDenied && freshDenied,
      revokedEffectDelta: isDeepStrictEqual(revokedBefore, revokedAfter) ? 0 : 1,
      lineageBound: original.receipt.org_id === fixture.org
        && original.receipt.workspace_id === fixture.workspace
        && original.receipt.actor_id === fixture.requester,
      providerDisabled: await providerDisabled(db),
      providerEffectDelta: footprintDelta(providerBefore,
        await providerFootprint(db, fixture.org, fixture.workspace)),
      hostedStorageNotRun: true,
    };
  });

  await runCase('EI-005', async () => {
    markPhase('setup-approved-modernization-decision');
    const decisionId = await seedApprovedModernizationDecision(db, 5000);
    const authVersion = await authorizationVersion(db, fixture.org, fixture.requester);
    const blueprintId = uuid(5010);
    const requestPayload = { modernizationDecisionId: decisionId, blueprintId, schemaVersion: 'assemble-blueprint-1' };
    const requestHash = await serverHash(db, requestPayload);
    const decision = await row(db,
      'SELECT id,primary_disposition,resource_hash,status FROM public.enterprise_modernization_decisions WHERE id=$1',
      [decisionId]);
    assert.equal(decision.status, 'approved');
    const structuredContent = { components: [], execution: { enabled: false } };
    const readableDocument = 'Synthetic draft-only Assemble blueprint';
    const resourceHash = await serverHash(db, {
      modernizationDecisionId: decision.id, decisionHash: decision.resource_hash,
      disposition: decision.primary_disposition, schemaVersion: 'assemble-blueprint-1',
      structuredContent, readableDocument, version: 1,
    });
    const finalResult = {
      blueprintId, status: 'draft', version: 1, resourceHash,
      executionEnabled: false, runtimeAgentsEnabled: false, liveTelemetryEnabled: false,
    };
    const fingerprint = () => targetFingerprint(db, fixture.org, fixture.workspace);
    markPhase('foreign-and-nonservice-denials');
    const foreignTenantDenied = await expectRejectedWithoutEffect(db, 'ei_005_foreign',
      () => assertAuthority(db, fixture.requester, foreignOrg, foreignWorkspace, 'assemble.manage', authVersion),
      /PR1B_NOT_FOUND|AUTHORIZATION/u, () => targetFingerprint(db, foreignOrg, foreignWorkspace));
    const nonServiceDenied = await expectRejectedWithoutEffect(db, 'ei_005_nonservice',
      () => authenticatedCall(db, fixture.requester, () => db.query(
        `SELECT public.enterprise_ai_claim_command(
          $1,$2,$3,'assemble.blueprint.create',$4,$5,$6,NULL,$7
        )`,
        [fixture.requester, fixture.org, fixture.workspace, 'ei-005-nonservice',
          uuid(5011), requestHash, uuid(5012)],
      )), /permission denied|does not exist/u, fingerprint);

    markPhase('blueprint-command-commit');
    const before = await targetCounts(db, fixture.org, fixture.workspace, 'assemble.blueprint.create');
    const providerBefore = await providerFootprint(db, fixture.org, fixture.workspace);
    await assertAuthority(db, fixture.requester, fixture.org, fixture.workspace, 'assemble.manage', authVersion);
    const receipt = (await serviceCall(db, () => db.query(
      `SELECT * FROM public.enterprise_ai_claim_command(
        $1,$2,$3,'assemble.blueprint.create',$4,$5,$6,NULL,$7
      )`,
      [fixture.requester, fixture.org, fixture.workspace, 'ei-005-draft-blueprint',
        uuid(5013), requestHash, uuid(5014)],
    ))).rows[0];
    await serviceCall(db, () => db.query(
      'SELECT public.enterprise_ai_plan_command($1,$2,$3,$4,$5,$6::jsonb)',
      [receipt.id, fixture.org, fixture.workspace, receipt.execution_token,
        receipt.execution_fence, JSON.stringify({
          modernizationDecisionId: decisionId, schemaVersion: 'assemble-blueprint-1',
          executionEnabled: false, providerCallPlanned: false,
        })],
    ));
    const committed = (await serviceCall(db, () => db.query(
      `SELECT public.enterprise_commit_assemble_blueprint(
        $1::jsonb,$2,$3,$4,$5,$6,$7,$8::jsonb
      ) value`,
      [JSON.stringify({ id: blueprintId, modernizationDecisionId: decisionId,
        structuredContent, readableDocument }), fixture.requester, fixture.org,
      fixture.workspace, receipt.id, receipt.execution_token, receipt.execution_fence,
      JSON.stringify(finalResult)],
    ))).rows[0].value;
    assert.deepEqual(committed, finalResult);
    const completed = (await serviceCall(db, () => db.query(
      'SELECT * FROM public.enterprise_ai_complete_command($1,$2,$3,$4,$5,$6::jsonb,$7)',
      [receipt.id, fixture.org, fixture.workspace, receipt.execution_token,
        receipt.execution_fence, JSON.stringify(finalResult), blueprintId],
    ))).rows[0];
    const after = await targetCounts(db, fixture.org, fixture.workspace, 'assemble.blueprint.create');
    const blueprint = await row(db,
      `SELECT org_id,workspace_id,modernization_decision_id,disposition,schema_version,
        version,status,code_generation_enabled,deployment_enabled,infrastructure_changes_enabled,
        credential_access_enabled,source_system_calls_enabled,runtime_agents_enabled,
        live_telemetry_enabled,resource_hash,created_by
       FROM public.enterprise_assemble_blueprints WHERE id=$1`, [blueprintId]);
    const controls = [
      blueprint.code_generation_enabled, blueprint.deployment_enabled,
      blueprint.infrastructure_changes_enabled, blueprint.credential_access_enabled,
      blueprint.source_system_calls_enabled, blueprint.runtime_agents_enabled,
      blueprint.live_telemetry_enabled,
    ];
    markPhase('blueprint-immutable-denial');
    const forbiddenMutationDenied = await expectRejectedWithoutEffect(db, 'ei_005_mutation',
      () => serviceCall(db, () => db.query(
        'UPDATE public.enterprise_assemble_blueprints SET deployment_enabled=true WHERE id=$1',
        [blueprintId],
      )), /check constraint|IMMUTABLE|immutable/u, fingerprint);
    markPhase('blueprint-exact-replay');
    const replayBefore = await targetCounts(db, fixture.org, fixture.workspace, 'assemble.blueprint.create');
    const replay = await replayCommand(db, {
      actorId: fixture.requester, orgId: fixture.org, workspaceId: fixture.workspace,
      commandType: 'assemble.blueprint.create', idempotencyKey: 'ei-005-draft-blueprint',
      requestId: uuid(5015), requestHash, executionToken: uuid(5016),
    }, authVersion, 'assemble.manage');
    const replayAfter = await targetCounts(db, fixture.org, fixture.workspace, 'assemble.blueprint.create');
    assert.equal(replay.id, completed.id);
    assert.deepEqual(replay.response, finalResult);
    return {
      logicalMutationCount: 1,
      blueprintDelta: after.blueprints - before.blueprints,
      receiptDelta: after.receipts - before.receipts,
      effectDelta: after.effects - before.effects,
      schemaVersionBound: blueprint.schema_version === 'assemble-blueprint-1',
      statusDraft: blueprint.status === 'draft',
      sevenControlsDisabled: controls.length === 7 && controls.every(value => value === false),
      forbiddenMutationDenied,
      deniedEffectDelta: 0,
      foreignTenantDenied, nonServiceDenied,
      decisionLineageBound: blueprint.modernization_decision_id === decisionId
        && blueprint.resource_hash === resourceHash,
      receiptBinding: completed.resource_id === blueprintId
        && completed.response_hash === await serverHash(db, finalResult),
      exactReplay: replay.status === 'committed' && replay.resource_id === blueprintId,
      replayEffectDelta: replayAfter.effects - replayBefore.effects,
      providerDisabled: await providerDisabled(db),
      providerEffectDelta: footprintDelta(providerBefore,
        await providerFootprint(db, fixture.org, fixture.workspace)),
      operationalEffectsDisabled: footprintDelta(providerBefore,
        await providerFootprint(db, fixture.org, fixture.workspace)) === 0,
      hostedExecutionNotRun: true,
    };
  });
} catch (error) {
  setupFailurePhase = String(activeCasePhase).startsWith('setup-')
    ? activeCasePhase : 'setup-foundation';
  const sqlState = typeof error?.code === 'string' && /^[0-9A-Z]{5}$/u.test(error.code)
    ? error.code : 'unknown';
  console.error(`BLOCKED Enterprise Intelligence acceptance phase=${setupFailurePhase} setup_failed sqlstate=${sqlState}`);
} finally {
  if (parserTempDirectory) {
    try { await removeParserOutput(); }
    catch { cleanupErrors.push('parser-temp-cleanup'); }
  }
  if (db) {
    try { await db.end(); } catch { cleanupErrors.push('database-client-close'); }
  }
  if (admin && databaseCreated) {
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      if ((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [dbName])).rowCount) {
        cleanupErrors.push('database-drop-verification');
      }
    } catch { cleanupErrors.push('database-drop'); }
  }
  if (admin) {
    for (const roleName of createdRoles.reverse()) {
      try {
        await admin.query(`DROP ROLE IF EXISTS ${roleName}`);
        if ((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [roleName])).rowCount) {
          cleanupErrors.push(`role-drop-verification:${roleName}`);
        }
      } catch { cleanupErrors.push(`role-drop:${roleName}`); }
    }
    try { await admin.end(); } catch { cleanupErrors.push('admin-client-close'); }
  }
}

if (cleanupErrors.length) throw new Error(`ENTERPRISE_INTELLIGENCE_ACCEPTANCE_CLEANUP_FAILED:${cleanupErrors.join(',')}`);
if (setupFailurePhase) {
  Object.assign(blockedByTestId, completeEnterpriseIntelligenceAcceptanceSetupBlocked({
    actualByTestId, failuresByTestId, blockedByTestId,
  }));
}
const retainedResultPath = process.env.RETAINED_TEST_ID_RESULTS;
const finalization = finalizeEnterpriseIntelligenceAcceptanceExecution({
  actualByTestId, failuresByTestId, blockedByTestId, retainedResultPath,
});
if (retainedResultPath) {
  writeEnterpriseIntelligenceAcceptanceProducer(retainedResultPath, {
    actualByTestId, failuresByTestId, blockedByTestId,
    identity: {
      releaseSha: process.env.RELEASE_SHA,
      workflowRunId: process.env.GITHUB_RUN_ID,
      workflowAttempt: process.env.GITHUB_RUN_ATTEMPT,
      environment: process.env.ACCEPTANCE_EVIDENCE_ENVIRONMENT,
      workflowPath: process.env.ACCEPTANCE_WORKFLOW_PATH,
    },
    command: process.env.RETAINED_SUITE_COMMAND,
    cleanupVerified: true,
  });
}
if (finalization.shouldFailProcess) throw new Error('ENTERPRISE_INTELLIGENCE_ACCEPTANCE_STANDALONE_INCOMPLETE');
console.log(`Enterprise Intelligence PostgreSQL acceptance completed: ${finalization.counts.passed} passed, ${finalization.counts.failed} failed, ${finalization.counts.blocked} blocked; hosted Storage and provider execution not run.`);

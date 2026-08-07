import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import pg from 'pg';
import {createEnterpriseIntelligenceFixture} from './enterpriseIntelligencePostgresFixture.mjs';

execFileSync(process.execPath, ['scripts/testEnterpriseIntelligenceMigration.mjs'], {stdio: 'inherit'});

const adminUrl = process.env.ENTERPRISE_INTELLIGENCE_MIGRATION_DATABASE_URL;
if (!adminUrl) {
  if (process.env.CI) throw new Error('ENTERPRISE_INTELLIGENCE_MIGRATION_DATABASE_URL is required in CI.');
  console.log('Enterprise Intelligence PostgreSQL 16 scenarios skipped: ENTERPRISE_INTELLIGENCE_MIGRATION_DATABASE_URL is not set.');
  process.exit(0);
}

const {Client} = pg;
const feature = '20260804120000_enterprise_intelligence_authority.sql';
const migrations = (await readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
const featureIndex = migrations.indexOf(feature);
assert.ok(featureIndex > 0, 'Enterprise Intelligence migration is missing from the chronological chain.');
const baseline = migrations.slice(0, featureIndex);
const featureChain = migrations.slice(featureIndex);
const suffix = `${process.pid}_${Date.now()}`;
const names = {
  fresh: `enterprise_fresh_${suffix}`,
  upgrade: `enterprise_upgrade_${suffix}`,
  populated: `enterprise_populated_${suffix}`,
  dirty: `enterprise_dirty_${suffix}`,
  authority: `enterprise_authority_${suffix}`,
};
const clients = [];
const createdDatabases = [];
const createdRoles = [];
const urlFor = name => { const url = new URL(adminUrl); url.pathname = `/${name}`; return url.toString(); };
const connect = async url => { const client = new Client({connectionString: url}); await client.connect(); clients.push(client); return client; };
const transaction = async (client, label, sql) => {
  await client.query('BEGIN');
  try { await client.query(sql); await client.query('COMMIT'); console.log(`APPLIED ${label}`); }
  catch (error) { await client.query('ROLLBACK'); throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`); }
};
const bootstrap = client => transaction(client, 'Supabase auth bootstrap', `
  CREATE SCHEMA auth;
  CREATE TABLE auth.users(id uuid primary key);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
  GRANT USAGE ON SCHEMA auth TO authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
`);
const apply = async (client, list) => {
  for (const name of list) await transaction(client, name, await readFile(join('supabase/migrations', name), 'utf8'));
};
const createDatabase = async (admin, name) => {
  assert.match(name, /^[a-z0-9_]+$/);
  assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount, 0, `Refusing to overwrite ${name}`);
  await admin.query(`CREATE DATABASE ${name}`);
  createdDatabases.push(name);
  console.log(`CREATED DATABASE ${name}`);
  const client = await connect(urlFor(name));
  await bootstrap(client);
  return client;
};
const scenarios = [];
const scenario = async (name, operation) => {
  await operation();
  scenarios.push(name);
  console.log(`PASS ${name}`);
};
const enterpriseTables = [
  'enterprise_intelligence_runtime_control', 'enterprise_ai_capability_routes',
  'enterprise_ai_command_receipts', 'enterprise_ai_receipt_replay_requests',
  'enterprise_ai_effect_journal', 'enterprise_ai_job_ledger', 'enterprise_ai_usage_ledger',
  'enterprise_ai_job_attempts', 'enterprise_ai_extraction_staged_results',
  'enterprise_evidence_sources', 'enterprise_evidence_source_versions', 'enterprise_evidence_candidates',
  'enterprise_evidence_candidate_edits', 'enterprise_evidence_questions', 'enterprise_evidence_assess_promotions',
  'enterprise_studio_delivery_handoffs', 'enterprise_delivery_work_packages',
  'enterprise_delivery_work_package_versions', 'enterprise_delivery_work_items',
  'enterprise_monitor_baselines', 'enterprise_modernization_assessments',
  'enterprise_modernization_decisions', 'enterprise_assemble_blueprints',
  'enterprise_high_impact_review_events', 'enterprise_high_impact_approvals',
];

let admin;
try {
  admin = await connect(adminUrl);
  for (const [role, attributes] of [['anon', 'NOLOGIN'], ['authenticated', 'NOLOGIN'], ['service_role', 'NOLOGIN BYPASSRLS']]) {
    if (!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role])).rowCount) {
      await admin.query(`CREATE ROLE ${role} ${attributes}`);
      createdRoles.push(role);
    }
  }

  const fresh = await createDatabase(admin, names.fresh);
  await apply(fresh, migrations);
  console.log('FOUNDATION PASS fresh ordered apply');

  const upgrade = await createDatabase(admin, names.upgrade);
  await apply(upgrade, baseline);
  await apply(upgrade, featureChain);
  console.log('FOUNDATION PASS accepted-main-to-feature upgrade');

  const populated = await createDatabase(admin, names.populated);
  await apply(populated, baseline);
  const legacyOrg = '99100000-0000-4000-8000-000000000001';
  const legacyProvider = '99100000-0000-4000-8000-000000000002';
  await populated.query("INSERT INTO public.organizations(id,name,slug) VALUES($1,'Enterprise legacy','enterprise-legacy')", [legacyOrg]);
  await populated.query("INSERT INTO public.ai_provider_configs(id,org_id,provider,display_name,status) VALUES($1,$2,'gemini','Legacy provider','active')", [legacyProvider, legacyOrg]);
  await apply(populated, featureChain);
  assert.deepEqual((await populated.query('SELECT endpoint_url,deployment_name,model_allowlist,budget_policy FROM public.ai_provider_configs WHERE id=$1', [legacyProvider])).rows[0], {
    endpoint_url: null, deployment_name: null, model_allowlist: [], budget_policy: {},
  });
  console.log('FOUNDATION PASS populated upgrade preserves provider rows');

  const dirty = await createDatabase(admin, names.dirty);
  await apply(dirty, baseline);
  await dirty.query('CREATE TABLE public.enterprise_ai_capability_routes(blocker integer)');
  await assert.rejects(transaction(dirty, feature, await readFile(join('supabase/migrations', feature), 'utf8')), /ENTERPRISE_INTELLIGENCE_DIRTY_SCHEMA/);
  assert.equal((await dirty.query("SELECT to_regclass('public.enterprise_evidence_sources') relation")).rows[0].relation, null);
  assert.equal((await dirty.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_provider_configs' AND column_name='endpoint_url'")).rows[0].n, 0);
  assert.equal((await dirty.query("SELECT count(*)::int n FROM public.capabilities WHERE capability_key='evidence.write'")).rows[0].n, 0);
  console.log('FOUNDATION PASS incompatible dirty-schema rejection is atomic');

  const authority = await createDatabase(admin, names.authority);
  await apply(authority, migrations);

  await scenario('PostgreSQL 16 and exact forced-RLS inventory', async () => {
    assert.equal(Number((await authority.query("SELECT current_setting('server_version_num')::int version")).rows[0].version) >= 160000, true);
    const rows = (await authority.query(
      "SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[]) ORDER BY relname",
      [enterpriseTables],
    )).rows;
    assert.equal(rows.length, enterpriseTables.length);
    for (const row of rows) assert.deepEqual([row.relrowsecurity, row.relforcerowsecurity], [true, true], row.relname);
  });
  await scenario('least-privilege table and RPC grants', async () => {
    for (const table of enterpriseTables) {
      assert.equal((await authority.query("SELECT has_table_privilege('authenticated',$1,'SELECT') allowed", [`public.${table}`])).rows[0].allowed, false, table);
      assert.equal((await authority.query("SELECT has_table_privilege('service_role',$1,'SELECT') allowed", [`public.${table}`])).rows[0].allowed, true, table);
      const appendOnly = table === 'enterprise_ai_receipt_replay_requests' || table === 'enterprise_ai_effect_journal';
      assert.equal((await authority.query("SELECT has_table_privilege('service_role',$1,'INSERT') allowed", [`public.${table}`])).rows[0].allowed, appendOnly, `${table}:insert`);
      assert.equal((await authority.query("SELECT has_table_privilege('service_role',$1,'UPDATE,DELETE') allowed", [`public.${table}`])).rows[0].allowed, false, `${table}:update-delete`);
    }
    assert.equal((await authority.query("SELECT has_function_privilege('authenticated','public.enterprise_create_evidence_source(jsonb,jsonb)','EXECUTE') allowed")).rows[0].allowed, false);
    assert.equal((await authority.query("SELECT has_function_privilege('service_role','public.enterprise_create_evidence_source(jsonb,jsonb)','EXECUTE') allowed")).rows[0].allowed, false);
    assert.equal((await authority.query("SELECT has_function_privilege('service_role','public.enterprise_create_evidence_source(jsonb,jsonb,uuid,uuid,bigint,jsonb)','EXECUTE') allowed")).rows[0].allowed, true);
    assert.equal((await authority.query("SELECT has_function_privilege('authenticated','public.enterprise_provider_lifecycle_transition(text,uuid,uuid,uuid,bigint,jsonb)','EXECUTE') allowed")).rows[0].allowed, false);
    assert.equal((await authority.query("SELECT has_function_privilege('service_role','public.enterprise_provider_lifecycle_transition(text,uuid,uuid,uuid,bigint,jsonb)','EXECUTE') allowed")).rows[0].allowed, false);
    assert.equal((await authority.query("SELECT has_function_privilege('service_role','public.enterprise_provider_lifecycle_transition(text,uuid,uuid,uuid,bigint,jsonb,uuid,uuid,bigint,jsonb)','EXECUTE') allowed")).rows[0].allowed, true);
    assert.equal((await authority.query("SELECT has_function_privilege('authenticated','public.enterprise_stage_evidence_extraction_result(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,integer,integer,integer,jsonb,jsonb,text,uuid,bigint)','EXECUTE') allowed")).rows[0].allowed, false);
    assert.equal((await authority.query("SELECT has_function_privilege('service_role','public.enterprise_stage_evidence_extraction_result(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,integer,integer,integer,jsonb,jsonb,text,uuid,bigint)','EXECUTE') allowed")).rows[0].allowed, true);
    assert.equal((await authority.query("SELECT has_function_privilege('service_role','public.enterprise_commit_evidence_extraction(uuid,uuid,uuid,uuid,text,integer,uuid,text,text,integer,integer,jsonb)','EXECUTE') allowed")).rows[0].allowed, false);
  });

  const fixture = await createEnterpriseIntelligenceFixture(authority);
  await scenario('extraction job claim, fenced recovery, replay, and terminal failure are idempotent', async () => {
    const trackedReceipts = [];
    const trackedJobs = [];
    const trackedCandidates = [];
    let providerCalls = 0;
    const extractionFailureCalls = {};
    const provider = 'openai';
    const capability = 'assess.evidence.extract';
    const model = 'fixture-model';
    const promptKey = 'assess.evidence.extract';
    const promptVersion = 'enterprise-evidence-extract-1';
    const routeId = fixture.uuid(690);
    await authority.query(
      `INSERT INTO public.enterprise_ai_capability_routes(
        id,org_id,workspace_id,provider_config_id,capability,model,enabled,allowed_roles,created_by,updated_by
      ) VALUES($1,$2,$3,$4,$5,$6,true,ARRAY[$7::text],$8,$8)`,
      [routeId, fixture.org, fixture.workspace, fixture.provider, capability, model, fixture.routeRole, fixture.requester],
    );
    let sequence = 700;
    const nextUuid = () => fixture.uuid(sequence++);
    const createReceipt = async (source, label, client = authority) => {
      const receiptIdempotency = `extraction-recovery-${label}`;
      const requestHash = fixture.hash(String((sequence % 6) + 1));
      const requestId = nextUuid();
      const token = nextUuid();
      const receipt = (await client.query(
        `SELECT (public.enterprise_ai_claim_command(
          $1,$2,$3,'evidence.extract',$4,$5,$6,NULL,$7
        )).*`,
        [fixture.requester, fixture.org, fixture.workspace, receiptIdempotency, requestId, requestHash, token],
      )).rows[0];
      const jobId = nextUuid();
      const plan = {
        jobId, sourceId: source.sourceId, sourceVersionId: source.sourceVersionId,
        organizationId: fixture.org, workspaceId: fixture.workspace,
        routeId, providerConfigId: fixture.provider, provider, capability, model,
        endpointIdentity: null, deploymentIdentity: null,
        promptKey, promptVersion, requestHash,
      };
      const planned = (await client.query(
        'SELECT (public.enterprise_ai_plan_command($1,$2,$3,$4,$5,$6::jsonb)).*',
        [receipt.id, fixture.org, fixture.workspace, token, receipt.execution_fence, JSON.stringify(plan)],
      )).rows[0];
      trackedReceipts.push(receipt.id);
      trackedJobs.push(jobId);
      return {receipt: planned, jobId, source, requestHash, plan};
    };
    const claimJob = async (entry, token = entry.receipt.execution_token, fence = entry.receipt.execution_fence, overrides = {}, client = authority) => {
      const values = {
        sourceId: entry.source.sourceId, sourceVersionId: entry.source.sourceVersionId,
        providerConfigId: fixture.provider, provider, capability, model, promptKey, promptVersion,
        requestHash: entry.requestHash, ...overrides,
      };
      return (await client.query(
        `SELECT public.enterprise_claim_or_resume_evidence_extraction_job_v2(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
        ) result`,
        [entry.jobId, entry.receipt.id, fixture.org, fixture.workspace, fixture.requester,
          values.sourceId, values.sourceVersionId, routeId, values.providerConfigId, values.provider,
          values.capability, values.model, null, null, values.promptKey, values.promptVersion,
          values.requestHash, token, fence],
      )).rows[0].result;
    };
    const expire = async entry => {
      await authority.query("UPDATE public.enterprise_ai_command_receipts SET lease_expires_at=statement_timestamp()-interval '1 second' WHERE id=$1", [entry.receipt.id]);
      await authority.query('ALTER TABLE public.enterprise_ai_job_ledger DISABLE TRIGGER enterprise_job_guard_before_mutation');
      try {
        await authority.query("UPDATE public.enterprise_ai_job_ledger SET attempt_lease_expires_at=statement_timestamp()-interval '1 second' WHERE id=$1", [entry.jobId]);
      } finally {
        await authority.query('ALTER TABLE public.enterprise_ai_job_ledger ENABLE TRIGGER enterprise_job_guard_before_mutation');
      }
    };
    const reclaimReceipt = async (entry, token, client = authority) => (
      await client.query(
        `SELECT (public.enterprise_ai_claim_command(
          $1,$2,$3,'evidence.extract',$4,$5,$6,NULL,$7
        )).*`,
        [fixture.requester, fixture.org, fixture.workspace,
          `extraction-recovery-${entry.label}`, nextUuid(), entry.requestHash, token],
      )
    ).rows[0];
    const stage = async (entry, receipt, candidateId, {countProvider = true, stageHash = fixture.hash('f')} = {}) => {
      if (countProvider) providerCalls += 1;
      trackedCandidates.push(candidateId);
      const safeResult = {
        resourceId: entry.jobId, jobId: entry.jobId, sourceId: entry.source.sourceId,
        sourceVersionId: entry.source.sourceVersionId, candidateCount: 1,
        candidates: [{id: candidateId, field: 'process_objective'}],
      };
      const candidates = [{
        id: candidateId, sourceVersionId: entry.source.sourceVersionId,
        field: 'process_objective', value: `Recovered evidence ${candidateId}`,
        safeExcerpt: 'Recovered evidence is governed and independently reviewed.',
        excerptHash: fixture.hash('d'), sourceLocator: 'line:1-1', confidence: 0.9,
        promptVersion, status: 'suggested', createdBy: fixture.requester,
      }];
      await authority.query(
        `SELECT public.enterprise_stage_evidence_extraction_result(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,12,20,10,$13::jsonb,$14::jsonb,$15,$16,$17
        )`,
        [entry.jobId, receipt.id, entry.source.sourceId, entry.source.sourceVersionId,
          fixture.org, fixture.workspace, routeId, fixture.provider, provider, model,
          entry.requestHash, fixture.hash('e'), JSON.stringify(candidates), JSON.stringify(safeResult),
          stageHash, receipt.execution_token, receipt.execution_fence],
      );
      return safeResult;
    };
    const commitStaged = async (entry, receipt, {reconcile = true} = {}) => {
      await authority.query(
        'SELECT public.enterprise_commit_staged_evidence_extraction($1,$2,$3,$4,$5,$6)',
        [entry.jobId, receipt.id, fixture.org, fixture.workspace,
          receipt.execution_token, receipt.execution_fence],
      );
      if (reconcile) {
        await authority.query('SELECT public.enterprise_ai_reload_command($1,$2,$3)',
          [receipt.id, fixture.org, fixture.workspace]);
      }
    };
    const commit = async (entry, receipt, candidateId, options) => {
      const safeResult = await stage(entry, receipt, candidateId);
      await commitStaged(entry, receipt, options);
      return safeResult;
    };
    const fail = async (entry, receipt, failureClass = 'PROVIDER_RESPONSE_INVALID') => {
      extractionFailureCalls[failureClass] = (extractionFailureCalls[failureClass] || 0) + 1;
      const response = {ok:false,error:{code:'COMMAND_BLOCKED',message:'The Enterprise Intelligence command could not be completed.'}};
      await authority.query(
        `SELECT public.enterprise_fail_evidence_extraction_job(
          $1,$2,$3,$4,$5,$6,$7,8,$8::jsonb,true
        )`,
        [entry.jobId, receipt.id, fixture.org, fixture.workspace, receipt.execution_token,
          receipt.execution_fence, failureClass, JSON.stringify(response)],
      );
      return response;
    };

    // Crash after insert, before provider: recover one stable row with a newer fence.
    const crashed = await createReceipt(fixture.sources[1], 'crashed'); crashed.label = 'crashed';
    assert.equal((await claimJob(crashed)).ownsExecution, true);
    await expire(crashed);
    const recoveredToken = nextUuid();
    const recoveredReceipt = await reclaimReceipt(crashed, recoveredToken);
    assert.equal(recoveredReceipt.execution_token, recoveredToken);
    const resumed = await claimJob(crashed, recoveredToken, recoveredReceipt.execution_fence);
    assert.deepEqual([resumed.jobId, resumed.attemptCount, resumed.recoveryCount], [crashed.jobId, 2, 1]);
    const crashedResult = await commit(crashed, recoveredReceipt, nextUuid(), {reconcile:false});
    // Simulate a lost commit response: reload reconciles the canonical effect.
    const reconciled = (await authority.query(
      'SELECT (public.enterprise_ai_reload_command($1,$2,$3)).*',
      [crashed.receipt.id, fixture.org, fixture.workspace],
    )).rows[0];
    assert.deepEqual([reconciled.status, reconciled.response], ['committed', crashedResult]);
    const succeededReplay = await claimJob({...crashed, receipt: reconciled}, recoveredToken, recoveredReceipt.execution_fence);
    assert.deepEqual([succeededReplay.state, succeededReplay.ownsExecution, succeededReplay.safeResult], ['committed', false, crashedResult]);

    // A changed default model cannot overwrite the receipt-owned route plan.
    const modelChange = await createReceipt(fixture.sources[2], 'model-change'); modelChange.label = 'model-change';
    await claimJob(modelChange);
    await authority.query(
      "UPDATE public.ai_provider_configs SET default_model='new-default-model', model_allowlist=ARRAY['fixture-model','new-default-model'] WHERE id=$1",
      [fixture.provider],
    );
    await expire(modelChange);
    const modelToken = nextUuid();
    const modelReceipt = await reclaimReceipt(modelChange, modelToken);
    const modelResume = await claimJob(modelChange, modelToken, modelReceipt.execution_fence);
    assert.equal(modelResume.ownsExecution, true);
    const persistedModelPlan = (await authority.query(
      'SELECT execution_plan FROM public.enterprise_ai_command_receipts WHERE id=$1', [modelChange.receipt.id],
    )).rows[0].execution_plan;
    assert.deepEqual([persistedModelPlan.routeId, persistedModelPlan.providerConfigId, persistedModelPlan.model],
      [routeId, fixture.provider, model]);
    const modelChangeResult = await commit(modelChange, modelReceipt, nextUuid());
    assert.equal(modelChangeResult.resourceId, modelChange.jobId);

    // Provider success before staging remains recoverable; the later attempt
    // reuses the same job and one durable candidate/effect set.
    const preStage = await createReceipt(fixture.sources[3], 'pre-stage'); preStage.label = 'pre-stage';
    await claimJob(preStage);
    providerCalls += 1;
    await expire(preStage);
    const preStageToken = nextUuid();
    const preStageReceipt = await reclaimReceipt(preStage, preStageToken);
    assert.equal((await claimJob(preStage, preStageToken, preStageReceipt.execution_fence)).state, 'owned');
    await commit(preStage, preStageReceipt, nextUuid());

    // Staging response loss: recovery finds immutable sanitized data and does
    // not execute the provider again.
    const stageLost = await createReceipt(fixture.sources[4], 'stage-lost'); stageLost.label = 'stage-lost';
    await claimJob(stageLost);
    const stageLostResult = await stage(stageLost, stageLost.receipt, nextUuid());
    const providerCallsAfterStage = providerCalls;
    await expire(stageLost);
    const stageLostToken = nextUuid();
    const stageLostReceipt = await reclaimReceipt(stageLost, stageLostToken);
    const stagedRecovery = await claimJob(stageLost, stageLostToken, stageLostReceipt.execution_fence);
    assert.deepEqual([stagedRecovery.state, stagedRecovery.safeResult], ['staged', stageLostResult]);
    assert.equal(providerCalls, providerCallsAfterStage);
    await commitStaged(stageLost, stageLostReceipt);

    // Commit transport failure before database execution leaves the staged
    // result and running ownership recoverable without a provider replay.
    const commitTransport = await createReceipt(fixture.sources[5], 'commit-transport'); commitTransport.label = 'commit-transport';
    await claimJob(commitTransport);
    await stage(commitTransport, commitTransport.receipt, nextUuid());
    const providerCallsBeforeCommitRecovery = providerCalls;
    await expire(commitTransport);
    const commitTransportToken = nextUuid();
    const commitTransportReceipt = await reclaimReceipt(commitTransport, commitTransportToken);
    assert.equal((await claimJob(commitTransport, commitTransportToken, commitTransportReceipt.execution_fence)).state, 'staged');
    await commitStaged(commitTransport, commitTransportReceipt);
    assert.equal(providerCalls, providerCallsBeforeCommitRecovery);

    // Two recovery contenders: the receipt fence admits one token; the other is stale.
    const concurrent = await createReceipt(fixture.sources[6], 'concurrent'); concurrent.label = 'concurrent';
    await claimJob(concurrent);
    await expire(concurrent);
    const contender = await connect(urlFor(names.authority));
    const tokenA = nextUuid(); const tokenB = nextUuid();
    const [receiptA, receiptB] = await Promise.all([
      reclaimReceipt(concurrent, tokenA), reclaimReceipt(concurrent, tokenB, contender),
    ]);
    const winner = receiptA.execution_token === tokenA ? receiptA : receiptB;
    const winnerToken = winner.execution_token;
    const loserToken = winnerToken === tokenA ? tokenB : tokenA;
    assert.equal([receiptA.execution_token === tokenA, receiptB.execution_token === tokenB].filter(Boolean).length, 1);
    const concurrentResume = await claimJob(concurrent, winnerToken, winner.execution_fence);
    assert.equal(concurrentResume.ownsExecution, true);
    await assert.rejects(claimJob(concurrent, loserToken, winner.execution_fence), /ENTERPRISE_AI_STALE_EXECUTION_FENCE/);
    await commit(concurrent, winner, nextUuid());
    await authority.query('SELECT public.enterprise_ai_reload_command($1,$2,$3)', [concurrent.receipt.id, fixture.org, fixture.workspace]);

    // A non-expired owner excludes a new worker; terminate the original attempt.
    const active = await createReceipt(fixture.sources[7], 'active'); active.label = 'active';
    await claimJob(active);
    const activeContenderToken = nextUuid();
    const activeReplay = await reclaimReceipt(active, activeContenderToken);
    assert.notEqual(activeReplay.execution_token, activeContenderToken);
    await assert.rejects(claimJob(active, activeContenderToken, activeReplay.execution_fence), /ENTERPRISE_AI_STALE_EXECUTION_FENCE/);
    providerCalls += 1;
    const activeFailedResult = await fail(active, active.receipt, 'PROVIDER_TIMEOUT');
    const activeFailedReplay = await claimJob(active);
    assert.deepEqual([activeFailedReplay.state, activeFailedReplay.safeResult], ['blocked', activeFailedResult]);

    // Canonical mismatches fail without effects, then the original owner can finalize safely.
    const mismatch = await createReceipt(fixture.sources[1], 'mismatch'); mismatch.label = 'mismatch';
    await claimJob(mismatch);
    const effectsBeforeMismatch = Number((await authority.query(
      'SELECT count(*)::int n FROM public.enterprise_ai_effect_journal WHERE receipt_id=$1', [mismatch.receipt.id],
    )).rows[0].n);
    await assert.rejects(claimJob(mismatch, mismatch.receipt.execution_token, mismatch.receipt.execution_fence, {model:'changed-model'}), /ENTERPRISE_AI_JOB_IDEMPOTENCY_CONFLICT/);
    assert.equal(Number((await authority.query(
      'SELECT count(*)::int n FROM public.enterprise_ai_effect_journal WHERE receipt_id=$1', [mismatch.receipt.id],
    )).rows[0].n), effectsBeforeMismatch);
    await fail(mismatch, mismatch.receipt, 'EXTRACTION_IDENTITY_CONFLICT');

    // Provider/decoding failure reaches one terminal job/receipt and exact replay.
    const decoding = await createReceipt(fixture.sources[2], 'decoding'); decoding.label = 'decoding';
    await claimJob(decoding);
    providerCalls += 1;
    const failedResult = await fail(decoding, decoding.receipt);
    const failedReplay = await claimJob(decoding);
    assert.deepEqual([failedReplay.state, failedReplay.ownsExecution, failedReplay.safeResult], ['blocked', false, failedResult]);

    // A changed exact route model is terminal for this receipt even when both
    // models remain allowlisted. Restoring the route cannot revive the plan.
    const routeModelChanged = await createReceipt(fixture.sources[4], 'route-model-changed'); routeModelChanged.label = 'route-model-changed';
    await claimJob(routeModelChanged);
    const providerCallsBeforeRouteModelChange = providerCalls;
    await authority.query("UPDATE public.enterprise_ai_capability_routes SET model='new-default-model' WHERE id=$1", [routeId]);
    assert.equal((await authority.query('SELECT model FROM public.enterprise_ai_capability_routes WHERE id=$1', [routeId])).rows[0].model, 'new-default-model');
    const routeModelChangedResult = await fail(routeModelChanged, routeModelChanged.receipt, 'EXTRACTION_ROUTE_BLOCKED');
    assert.equal(providerCalls, providerCallsBeforeRouteModelChange);
    await authority.query('UPDATE public.enterprise_ai_capability_routes SET model=$2 WHERE id=$1', [routeId, model]);
    const routeModelChangedReplay = await claimJob(routeModelChanged);
    assert.deepEqual([routeModelChangedReplay.state, routeModelChangedReplay.safeResult], ['blocked', routeModelChangedResult]);

    // A revoked planned route is terminal and never falls back to another
    // provider configuration or model.
    const revoked = await createReceipt(fixture.sources[3], 'route-revoked'); revoked.label = 'route-revoked';
    await claimJob(revoked);
    const providerCallsBeforeRevocation = providerCalls;
    await authority.query('UPDATE public.enterprise_ai_capability_routes SET enabled=false WHERE id=$1', [routeId]);
    assert.equal((await authority.query('SELECT enabled FROM public.enterprise_ai_capability_routes WHERE id=$1', [routeId])).rows[0].enabled, false);
    const revokedResult = await fail(revoked, revoked.receipt, 'EXTRACTION_ROUTE_BLOCKED');
    assert.equal(providerCalls, providerCallsBeforeRevocation);
    const revokedReplay = await claimJob(revoked);
    assert.deepEqual([revokedReplay.state, revokedReplay.safeResult], ['blocked', revokedResult]);

    const counts = (await authority.query(`SELECT
      (SELECT count(*)::int FROM public.enterprise_ai_command_receipts WHERE id=ANY($1::uuid[]) AND status='claimed') claimed_receipts,
      (SELECT count(*)::int FROM public.enterprise_ai_job_ledger WHERE id=ANY($2::uuid[]) AND status='running') running_jobs,
      (SELECT count(*)::int FROM (SELECT receipt_id FROM public.enterprise_ai_job_ledger WHERE id=ANY($2::uuid[]) GROUP BY receipt_id HAVING count(*)>1) duplicates) duplicate_jobs,
      (SELECT count(*)::int FROM public.enterprise_evidence_candidates WHERE id=ANY($3::uuid[])) candidates,
      (SELECT count(*)::int FROM public.enterprise_ai_usage_ledger WHERE job_id=ANY($2::uuid[])) usage_rows,
      (SELECT count(*)::int FROM public.enterprise_ai_effect_journal WHERE receipt_id=ANY($1::uuid[])) effects,
      (SELECT count(*)::int FROM public.enterprise_ai_job_attempts WHERE job_id=ANY($2::uuid[])) attempts,
      (SELECT count(*)::int FROM (SELECT job_id,count(*) FROM public.enterprise_ai_extraction_staged_results WHERE job_id=ANY($2::uuid[]) GROUP BY job_id HAVING count(*)>1) duplicate) duplicate_staged_results`,
      [trackedReceipts, trackedJobs, trackedCandidates])).rows[0];
    assert.deepEqual(counts, {
      claimed_receipts:0, running_jobs:0, duplicate_jobs:0,
      candidates:6, usage_rows:6, effects:11, attempts:17, duplicate_staged_results:0,
    });
    assert.equal(providerCalls, 9);
    console.log(`EXTRACTION RECOVERY COUNTS ${JSON.stringify({...counts, providerCalls,
      duplicateCandidates:0, duplicateUsageRows:0, duplicateEffects:0,
      planConflictCount:1, newDefaultProviderCalls:0, fallbackProviderCalls:0,
      extractionFailureCalls, extractionFailureCallsForTransport:0,
      stagedRecoveries:2, recoveredJobId:crashed.jobId,
      concurrentWinners:1, concurrentLosers:1})}`);
  });
  await scenario('provider lifecycle is atomic, tenant-bound, freshness-gated, sanitized, and fail-closed', async () => {
    const rpc = async (operation, payload, version = authorizationVersion) => (
      await authority.query(
        'SELECT public.enterprise_provider_lifecycle_transition($1,$2,$3,$4,$5,$6::jsonb) result',
        [operation, fixture.requester, fixture.org, fixture.workspace, version, JSON.stringify(payload)],
      )
    ).rows[0].result;
    const authorizationVersion = Number((await authority.query(
      'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',
      [fixture.org, fixture.requester],
    )).rows[0].version);
    const config = fixture.uuid(400); const route = fixture.uuid(401);
    const registerPayload = {
      providerConfigId: config, provider: 'openai', displayName: 'Lifecycle provider',
      endpoint: null, deployment: null, defaultModel: 'gpt-fixture', modelAllowlist: ['gpt-fixture'],
      capabilities: ['assess.evidence.extract'], budget: {monthlyRequestLimit: 100},
      routes: [{id: route, capability: 'assess.evidence.extract', model: 'gpt-fixture'}],
    };
    await assert.rejects(rpc('provider.register', registerPayload, authorizationVersion - 1), /PR1B_AUTHORIZATION_STALE/);
    assert.equal((await authority.query('SELECT count(*)::int n FROM public.ai_provider_configs WHERE id=$1', [config])).rows[0].n, 0);
    const foreignOrg = fixture.uuid(410); const foreignWorkspace = fixture.uuid(411);
    await authority.query("INSERT INTO public.organizations(id,name,slug) VALUES($1,'Lifecycle foreign','lifecycle-foreign')", [foreignOrg]);
    await authority.query("INSERT INTO public.workspaces(id,org_id,name,slug) VALUES($1,$2,'Lifecycle foreign','lifecycle-foreign')", [foreignWorkspace, foreignOrg]);
    await assert.rejects(authority.query(
      'SELECT public.enterprise_provider_lifecycle_transition($1,$2,$3,$4,$5,$6::jsonb)',
      ['provider.register', fixture.requester, foreignOrg, foreignWorkspace, authorizationVersion, JSON.stringify({...registerPayload, providerConfigId: fixture.uuid(412)})],
    ), /PR1B_NOT_FOUND|PR1B_AUTHORIZATION_STALE/);
    await assert.rejects(rpc('provider.register', {...registerPayload, providerConfigId: fixture.uuid(402), providerKey: 'sk-test-must-never-persist'}), /ENTERPRISE_PROVIDER_LIFECYCLE_INVALID/);
    await assert.rejects(rpc('provider.register', {...registerPayload, providerConfigId: fixture.uuid(413), budget: {nested: {api_key: 'sk-nested-must-never-persist'}}}), /ENTERPRISE_PROVIDER_LIFECYCLE_INVALID/);
    const registered = await rpc('provider.register', registerPayload);
    assert.deepEqual([registered.providerConfigId, registered.status], [config, 'pending_review']);
    assert.deepEqual((await authority.query('SELECT allowed_roles FROM public.enterprise_ai_capability_routes WHERE id=$1', [route])).rows[0].allowed_roles, [fixture.routeRole]);
    const tenantSegment = fixture.org.replaceAll('-', '').toUpperCase();
    const firstKey = fixture.uuid(403);
    const firstReference = `AVALA_PROVIDER_SECRET_OPENAI_${tenantSegment}_FIRST`;
    await rpc('provider.secret.bind', {
      providerConfigId: config, provider: 'openai', keyRefId: firstKey,
      secretReference: firstReference, safeFingerprint: `sha256:${'1'.repeat(24)}`, backend: 'environment',
    });
    await rpc('provider.validate', {providerConfigId: config, lastValidatedAt: '2000-01-01T00:00:00.000Z'});
    const serverValidation = (await authority.query('SELECT last_validated_at FROM public.ai_provider_configs WHERE id=$1', [config])).rows[0].last_validated_at;
    assert.ok(Date.now() - new Date(serverValidation).getTime() < 60_000);
    await authority.query("UPDATE public.ai_provider_configs SET last_validated_at=now()-interval '25 hours' WHERE id=$1", [config]);
    await assert.rejects(rpc('provider.activate', {providerConfigId: config, keyRefId: firstKey}), /ENTERPRISE_PROVIDER_VALIDATION_STALE/);
    await rpc('provider.validate', {providerConfigId: config, lastValidatedAt: new Date().toISOString()});
    await rpc('provider.activate', {providerConfigId: config, keyRefId: firstKey});
    await rpc('provider.route.toggle', {
      providerConfigId: config, routeId: route, capability: 'assess.evidence.extract',
      enabled: true, allowedRoles: [fixture.routeRole],
    });
    const roles = (await authority.query('SELECT allowed_roles FROM public.enterprise_ai_capability_routes WHERE id=$1', [route])).rows[0].allowed_roles;
    assert.deepEqual(roles, [fixture.routeRole]);
    await assert.rejects(rpc('provider.route.toggle', {
      providerConfigId: config, routeId: route, capability: 'assess.evidence.extract',
      enabled: true, allowedRoles: ['workspace reviewer'],
    }), /ENTERPRISE_PROVIDER_ROUTE_ROLES_INVALID/);
    await rpc('provider.route.toggle', {providerConfigId: config, routeId: route, enabled: false});
    await rpc('provider.route.toggle', {providerConfigId: config, routeId: route, capability: 'assess.evidence.extract', enabled: true});
    assert.deepEqual((await authority.query('SELECT allowed_roles FROM public.enterprise_ai_capability_routes WHERE id=$1', [route])).rows[0].allowed_roles, roles);
    const secondWorkspace = fixture.uuid(414); const secondWorkspaceRoute = fixture.uuid(415); const secondWorkspaceRole = fixture.uuid(416);
    await authority.query("INSERT INTO public.workspaces(id,org_id,name,slug) VALUES($1,$2,'Lifecycle second workspace','lifecycle-second')", [secondWorkspace, fixture.org]);
    await authority.query("INSERT INTO public.roles(id,org_id,workspace_id,name,slug,scope,permissions) VALUES($1,$2,$3,'Lifecycle second role','lifecycle-second-role','workspace','[]')", [secondWorkspaceRole, fixture.org, secondWorkspace]);
    await authority.query(`INSERT INTO public.enterprise_ai_capability_routes(
      id,org_id,workspace_id,provider_config_id,capability,model,enabled,allowed_roles,created_by,updated_by)
      VALUES($1,$2,$3,$4,'assess.evidence.extract','gpt-fixture',true,ARRAY[$6::text],$5,$5)`,
    [secondWorkspaceRoute, fixture.org, secondWorkspace, config, fixture.requester, secondWorkspaceRole]);
    const secondKey = fixture.uuid(404);
    await rpc('provider.secret.rotate', {
      providerConfigId: config, provider: 'openai', previousKeyRefId: firstKey, keyRefId: secondKey,
      secretReference: `AVALA_PROVIDER_SECRET_OPENAI_${tenantSegment}_SECOND`,
      safeFingerprint: `sha256:${'2'.repeat(24)}`, backend: 'environment', lastValidatedAt: new Date().toISOString(),
    });
    assert.deepEqual((await authority.query('SELECT status,rotation_status,deleted_at IS NOT NULL retired FROM public.ai_provider_key_refs WHERE id=$1', [firstKey])).rows[0], {status: 'retired', rotation_status: 'rotated', retired: true});
    await rpc('provider.revoke', {providerConfigId: config, keyRefId: secondKey, disableAllRoutes: true});
    assert.deepEqual((await authority.query('SELECT c.status,r.enabled,k.status key_status FROM public.ai_provider_configs c JOIN public.enterprise_ai_capability_routes r ON r.provider_config_id=c.id JOIN public.ai_provider_key_refs k ON k.id=$2 WHERE c.id=$1', [config, secondKey])).rows[0], {status: 'retired', enabled: false, key_status: 'retired'});
    assert.deepEqual((await authority.query('SELECT workspace_id,enabled FROM public.enterprise_ai_capability_routes WHERE provider_config_id=$1 ORDER BY workspace_id', [config])).rows, [
      {workspace_id: fixture.workspace, enabled: false},
      {workspace_id: secondWorkspace, enabled: false},
    ].sort((left, right) => left.workspace_id.localeCompare(right.workspace_id)));
    const evidence = (await authority.query('SELECT count(*)::int events, bool_and(org_id=$2 AND workspace_id=$3) tenant_bound, string_agg(metadata::text,\' \') metadata FROM public.ai_provider_audit_events WHERE provider_config_id=$1', [config, fixture.org, fixture.workspace])).rows[0];
    assert.equal(evidence.events, 10);
    assert.equal(evidence.tenant_bound, true);
    assert.doesNotMatch(evidence.metadata, /sk-test-must-never-persist|AVALA_PROVIDER_SECRET|providerKey/i);
  });
  await scenario('provider organization authority and exact workspace routes are separated', async () => {
    const workspaceB = fixture.uuid(630); const routeA = fixture.uuid(631); const routeB = fixture.uuid(632);
    const workspaceManager = fixture.uuid(633); const orgMemberRole = fixture.uuid(634); const workspaceRole = fixture.uuid(635);
    await authority.query("INSERT INTO public.workspaces(id,org_id,name,slug) VALUES($1,$2,'Provider workspace B','provider-workspace-b')", [workspaceB, fixture.org]);
    await authority.query('INSERT INTO auth.users(id) VALUES($1)', [workspaceManager]);
    await authority.query("INSERT INTO public.profiles(id,email) VALUES($1,'workspace-manager@fixture.invalid')", [workspaceManager]);
    await authority.query("INSERT INTO public.roles(id,org_id,name,slug,scope,permissions) VALUES($1,$2,'Organization member','provider-org-member','organization','[]')", [orgMemberRole, fixture.org]);
    await authority.query("INSERT INTO public.roles(id,org_id,workspace_id,name,slug,scope,permissions) VALUES($1,$2,$3,'Workspace provider manager','provider-workspace-manager','workspace','[]')", [workspaceRole, fixture.org, workspaceB]);
    await authority.query("INSERT INTO public.role_capabilities(role_id,capability_key) VALUES($1,'byok.manage'),($1,'security.manage')", [workspaceRole]);
    await authority.query("INSERT INTO public.organization_members(org_id,user_id,role_id,status) VALUES($1,$2,$3,'active')", [fixture.org, workspaceManager, orgMemberRole]);
    await authority.query("INSERT INTO public.workspace_memberships(org_id,workspace_id,user_id,role_id,status) VALUES($1,$2,$3,$4,'active')", [fixture.org, workspaceB, workspaceManager, workspaceRole]);
    const managerVersion = Number((await authority.query('SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [fixture.org, workspaceManager])).rows[0].version);
    await authority.query(`INSERT INTO public.enterprise_ai_capability_routes(
      id,org_id,workspace_id,provider_config_id,capability,model,enabled,allowed_roles,created_by,updated_by)
      VALUES($1,$2,$3,$4,'assess.evidence.extract','fixture-model',true,ARRAY[$8::text],$5,$5),
            ($6,$2,$7,$4,'assess.evidence.extract','fixture-model',true,ARRAY[$9::text],$5,$5)`,
    [routeA, fixture.org, fixture.workspace, fixture.provider, fixture.requester, routeB, workspaceB, fixture.routeRole, workspaceRole]);

    const deniedOperations = [
      ['provider.secret.bind', {providerConfigId: fixture.provider}],
      ['provider.validate', {providerConfigId: fixture.provider}],
      ['provider.activate', {providerConfigId: fixture.provider}],
      ['provider.secret.rotate', {providerConfigId: fixture.provider}],
      ['provider.revoke', {providerConfigId: fixture.provider}],
    ];
    for (const [index, [operation, payload]] of deniedOperations.entries()) {
      await assert.rejects(authority.query(
        'SELECT public.enterprise_provider_lifecycle_transition($1,$2,$3,$4,$5,$6::jsonb,$7,$8,1,$9::jsonb)',
        [operation, workspaceManager, fixture.org, workspaceB, managerVersion, JSON.stringify(payload), fixture.uuid(640 + index), fixture.uuid(650 + index), JSON.stringify({providerConfigId: fixture.provider})],
      ), /ENTERPRISE_PROVIDER_ORGANIZATION_AUTHORITY_REQUIRED/);
    }
    await assert.rejects(authority.query(
      'SELECT public.enterprise_provider_lifecycle_transition($1,$2,$3,$4,$5,$6::jsonb,$7,$8,1,$9::jsonb)',
      ['provider.route.toggle', workspaceManager, fixture.org, workspaceB, managerVersion, JSON.stringify({providerConfigId: fixture.provider, routeId: routeA, enabled: false}), fixture.uuid(660), fixture.uuid(661), JSON.stringify({providerConfigId: fixture.provider, routeId: routeA, enabled: false})],
    ), /ENTERPRISE_PROVIDER_ROUTE_INVALID/);

    const request = fixture.uuid(662); const token = fixture.uuid(663); const result = {providerConfigId: fixture.provider, routeId: routeB, enabled: false};
    const receipt = (await authority.query(
      "SELECT (public.enterprise_ai_claim_command($1,$2,$3,'provider.route.toggle','workspace-b-route-001',$4,$5,NULL,$6)).*",
      [workspaceManager, fixture.org, workspaceB, request, fixture.hash('4'), token],
    )).rows[0];
    await authority.query(
      'SELECT public.enterprise_provider_lifecycle_transition($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb)',
      ['provider.route.toggle', workspaceManager, fixture.org, workspaceB, managerVersion, JSON.stringify({providerConfigId: fixture.provider, routeId: routeB, enabled: false}), receipt.id, token, receipt.execution_fence, JSON.stringify(result)],
    );
    await authority.query(
      'SELECT public.enterprise_ai_complete_command($1,$2,$3,$4,$5,$6::jsonb,$7)',
      [receipt.id, fixture.org, workspaceB, token, receipt.execution_fence, JSON.stringify(result), fixture.provider],
    );
    assert.deepEqual((await authority.query('SELECT id,enabled FROM public.enterprise_ai_capability_routes WHERE id=ANY($1::uuid[]) ORDER BY id', [[routeA, routeB]])).rows, [
      {id: routeA, enabled: true}, {id: routeB, enabled: false},
    ].sort((left, right) => left.id.localeCompare(right.id)));
    assert.equal((await authority.query("SELECT public.enterprise_actor_has_organization_capability($1,$2,'byok.manage',$3) allowed", [workspaceManager, fixture.org, managerVersion])).rows[0].allowed, false);
    console.log(`PROVIDER AUTHORITY MATRIX ${JSON.stringify({workspaceOnlyOrganizationMutationsDenied:5,crossWorkspaceRouteDenied:1,ownWorkspaceRouteTransitions:1,otherWorkspaceRouteChanges:0})}`);
  });
  await scenario('provider authorization versions are attempt preconditions with distinct recovery outcomes', async () => {
    const actor = fixture.uuid(670); const role = fixture.uuid(671);
    await authority.query('INSERT INTO auth.users(id) VALUES($1)', [actor]);
    await authority.query("INSERT INTO public.profiles(id,email) VALUES($1,'provider-attempt@fixture.invalid')", [actor]);
    await authority.query("INSERT INTO public.roles(id,org_id,name,slug,scope,permissions) VALUES($1,$2,'Provider attempt manager','provider-attempt-manager','organization','[]')", [role, fixture.org]);
    await authority.query("INSERT INTO public.role_capabilities(role_id,capability_key) VALUES($1,'byok.manage'),($1,'security.manage')", [role]);
    await authority.query("INSERT INTO public.organization_members(org_id,user_id,role_id,status) VALUES($1,$2,$3,'active')", [fixture.org, actor, role]);
    await authority.query("INSERT INTO public.workspace_memberships(org_id,workspace_id,user_id,status) VALUES($1,$2,$3,'active')", [fixture.org, fixture.workspace, actor]);
    const authorizedVersion = Number((await authority.query(
      'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',
      [fixture.org, actor],
    )).rows[0].version);
    const claim = async ({key, request, hash, token, command}) => (
      await authority.query(
        'SELECT (public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,NULL,$8)).*',
        [actor, fixture.org, fixture.workspace, command, key, request, hash, token],
      )
    ).rows[0];
    const logicalHash = fixture.hash('8'); const firstToken = fixture.uuid(672);
    const first = await claim({
      key: 'provider-authorization-attempt-001', request: fixture.uuid(673), hash: logicalHash,
      token: firstToken, command: 'provider.validate',
    });
    const stablePlan = {providerConfigId: fixture.provider, plannedValidationId: fixture.uuid(674)};
    await authority.query(
      'SELECT public.enterprise_ai_plan_command($1,$2,$3,$4,$5,$6::jsonb)',
      [first.id, fixture.org, fixture.workspace, firstToken, first.execution_fence, JSON.stringify(stablePlan)],
    );
    await authority.query(
      'UPDATE public.authorization_versions SET version=version+1 WHERE org_id=$1 AND user_id=$2',
      [fixture.org, actor],
    );
    const refreshedVersion = Number((await authority.query(
      'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',
      [fixture.org, actor],
    )).rows[0].version);
    assert.equal(refreshedVersion, authorizedVersion + 1);
    const validationResult = {providerConfigId: fixture.provider, status: 'validated', lastValidatedAt: new Date().toISOString()};
    await assert.rejects(authority.query(
      'SELECT public.enterprise_provider_lifecycle_transition($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb)',
      ['provider.validate', actor, fixture.org, fixture.workspace, authorizedVersion,
        JSON.stringify({providerConfigId: fixture.provider, lastValidatedAt: validationResult.lastValidatedAt}),
        first.id, firstToken, first.execution_fence, JSON.stringify(validationResult)],
    ), /ENTERPRISE_PROVIDER_AUTHORIZATION_VERSION_STALE/);
    assert.equal((await authority.query('SELECT count(*)::int n FROM public.enterprise_ai_effect_journal WHERE receipt_id=$1', [first.id])).rows[0].n, 0);

    await authority.query("UPDATE public.enterprise_ai_command_receipts SET lease_expires_at=statement_timestamp()-interval '1 second' WHERE id=$1", [first.id]);
    const recoveryToken = fixture.uuid(675);
    const recovered = await claim({
      key: 'provider-authorization-attempt-001', request: fixture.uuid(676), hash: logicalHash,
      token: recoveryToken, command: 'provider.validate',
    });
    assert.equal(recovered.id, first.id);
    assert.equal(Number(recovered.execution_fence), Number(first.execution_fence) + 1);
    assert.deepEqual(recovered.execution_plan, stablePlan);
    await assert.rejects(claim({
      key: 'provider-authorization-attempt-001', request: fixture.uuid(677), hash: fixture.hash('9'),
      token: fixture.uuid(678), command: 'provider.validate',
    }), /ENTERPRISE_AI_IDEMPOTENCY_CONFLICT/);
    await authority.query(
      'SELECT public.enterprise_provider_lifecycle_transition($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb)',
      ['provider.validate', actor, fixture.org, fixture.workspace, refreshedVersion,
        JSON.stringify({providerConfigId: fixture.provider, lastValidatedAt: validationResult.lastValidatedAt}),
        recovered.id, recoveryToken, recovered.execution_fence, JSON.stringify(validationResult)],
    );
    await authority.query(
      'SELECT public.enterprise_ai_complete_command($1,$2,$3,$4,$5,$6::jsonb,$7)',
      [recovered.id, fixture.org, fixture.workspace, recoveryToken, recovered.execution_fence,
        JSON.stringify(validationResult), fixture.provider],
    );
    assert.equal((await authority.query('SELECT count(*)::int n FROM public.enterprise_ai_effect_journal WHERE receipt_id=$1', [first.id])).rows[0].n, 1);

    const beforeRemoval = (await authority.query(`SELECT
      (SELECT count(*)::int FROM public.ai_provider_key_refs WHERE org_id=$1) key_refs,
      (SELECT count(*)::int FROM public.enterprise_ai_capability_routes WHERE org_id=$1) routes,
      (SELECT concat_ws('|',status,key_ref_id::text,last_validated_at::text,default_model)
       FROM public.ai_provider_configs WHERE id=$2) provider_state`, [fixture.org, fixture.provider])).rows[0];
    const blockedToken = fixture.uuid(679); const blockedHash = fixture.hash('a');
    const blocked = await claim({
      key: 'provider-authority-removed-001', request: fixture.uuid(680), hash: blockedHash,
      token: blockedToken, command: 'provider.secret.rotate',
    });
    const blockedPlan = {
      provider: 'openai', secretReference: 'AVALA_PROVIDER_SECRET_OPENAI_SERVER_ONLY_TEST_REFERENCE',
      keyRefId: fixture.uuid(681), safeFingerprint: `sha256:${'7'.repeat(24)}`,
      secretOwnership: 'managed_write', secretPlanReceiptId: blocked.id,
      writeState: 'planned', validationSucceeded: true,
    };
    await authority.query(
      'SELECT public.enterprise_ai_plan_command($1,$2,$3,$4,$5,$6::jsonb)',
      [blocked.id, fixture.org, fixture.workspace, blockedToken, blocked.execution_fence, JSON.stringify(blockedPlan)],
    );
    const writtenBlockedPlan = {...blockedPlan, writeState: 'written', externalSecretWritten: true};
    const writtenReceipt = (await authority.query(
      'SELECT (public.enterprise_ai_plan_command($1,$2,$3,$4,$5,$6::jsonb)).*',
      [blocked.id, fixture.org, fixture.workspace, blockedToken, blocked.execution_fence, JSON.stringify(writtenBlockedPlan)],
    )).rows[0];
    assert.deepEqual(writtenReceipt.execution_plan, writtenBlockedPlan);
    await assert.rejects(authority.query(
      'SELECT public.enterprise_ai_plan_command($1,$2,$3,$4,$5,$6::jsonb)',
      [blocked.id, fixture.org, fixture.workspace, blockedToken, blocked.execution_fence, JSON.stringify(blockedPlan)],
    ), /ENTERPRISE_AI_EXECUTION_PLAN_CONFLICT/);

    await authority.query("DELETE FROM public.role_capabilities WHERE role_id=$1 AND capability_key='security.manage'", [role]);
    const removedVersion = Number((await authority.query(
      'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',
      [fixture.org, actor],
    )).rows[0].version);
    assert.ok(removedVersion > refreshedVersion);
    await assert.rejects(authority.query(
      'SELECT public.enterprise_provider_lifecycle_transition($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb)',
      ['provider.secret.rotate', actor, fixture.org, fixture.workspace, refreshedVersion,
        JSON.stringify({providerConfigId: fixture.provider}), blocked.id, blockedToken,
        blocked.execution_fence, JSON.stringify({providerConfigId: fixture.provider})],
    ), /ENTERPRISE_PROVIDER_ORGANIZATION_AUTHORITY_REQUIRED/);
    const afterRemoval = (await authority.query(`SELECT
      (SELECT count(*)::int FROM public.ai_provider_key_refs WHERE org_id=$1) key_refs,
      (SELECT count(*)::int FROM public.enterprise_ai_capability_routes WHERE org_id=$1) routes,
      (SELECT concat_ws('|',status,key_ref_id::text,last_validated_at::text,default_model)
       FROM public.ai_provider_configs WHERE id=$2) provider_state`, [fixture.org, fixture.provider])).rows[0];
    assert.deepEqual(afterRemoval, beforeRemoval);
    const blockedResult = {ok: false, error: {code: 'PERMISSION_DENIED', message: 'The provider lifecycle request could not be completed.'}};
    await authority.query(
      'SELECT public.enterprise_ai_fail_command($1,$2,$3,$4,$5,$6::jsonb,true)',
      [blocked.id, fixture.org, fixture.workspace, blockedToken, blocked.execution_fence, JSON.stringify(blockedResult)],
    );
    const blockedReplay = await claim({
      key: 'provider-authority-removed-001', request: fixture.uuid(682), hash: blockedHash,
      token: fixture.uuid(683), command: 'provider.secret.rotate',
    });
    assert.equal(blockedReplay.id, blocked.id);
    assert.equal(blockedReplay.status, 'blocked');
    assert.deepEqual(blockedReplay.response, blockedResult);
    assert.equal((await authority.query("SELECT count(*)::int n FROM public.enterprise_ai_command_receipts WHERE status='claimed'")).rows[0].n, 0);
    assert.equal((await authority.query(`SELECT count(*)::int n FROM (
      SELECT receipt_id,effect_key,count(*) FROM public.enterprise_ai_effect_journal
      WHERE receipt_id=ANY($1::uuid[]) GROUP BY receipt_id,effect_key HAVING count(*)>1
    ) duplicates`, [[first.id, blocked.id]])).rows[0].n, 0);
    assert.doesNotMatch(JSON.stringify({blockedPlan, blockedResult}), /provider-attempt@|raw-provider-key|uncommitted-secret/i);
    console.log(`PROVIDER AUTHORIZATION RECOVERY ${JSON.stringify({
      receipts: 2, recoveryWinners: 1, fence: recovered.execution_fence,
      canonicalEffects: 2, duplicateEffects: 0, claimedFinal: 0, removedAuthorityMutations: 0,
    })}`);
  });
  await scenario('revoked bind and rotate cleanup claims are exact, fenced, and idempotent', async () => {
    const denied = {ok: false, error: {code: 'PERMISSION_DENIED', message: 'The provider lifecycle request could not be completed.'}};
    const receiptIds = [];
    let seed = 1680;
    for (const operation of ['provider.secret.bind', 'provider.secret.rotate']) {
      const requestId = fixture.uuid(seed++); const executionToken = fixture.uuid(seed++);
      const idempotencyKey = `provider-cleanup-${operation.endsWith('bind') ? 'bind' : 'rotate'}-001`;
      const receipt = (await authority.query(
        'SELECT (public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,NULL,$8)).*',
        [fixture.requester, fixture.org, fixture.workspace, operation, idempotencyKey,
          requestId, fixture.hash(String(seed % 10)), executionToken],
      )).rows[0];
      const plan = {
        providerConfigId: fixture.provider,
        provider: 'openai',
        secretOwnership: 'managed_write',
        secretPlanReceiptId: receipt.id,
        secretReference: `AVALA_PROVIDER_SECRET_OPENAI_SERVER_PLAN_${seed}`,
        safeFingerprint: `sha256:${String(seed % 10).repeat(24)}`,
        keyRefId: fixture.uuid(seed++),
        writeState: 'written',
        validationSucceeded: false,
        ...(operation === 'provider.secret.rotate'
          ? {protectedSecretReferenceHash: `sha256:${String((seed + 1) % 10).repeat(24)}`}
          : {}),
      };
      await authority.query(
        'SELECT public.enterprise_ai_plan_command($1,$2,$3,$4,$5,$6::jsonb)',
        [receipt.id, fixture.org, fixture.workspace, executionToken,
          receipt.execution_fence, JSON.stringify(plan)],
      );

      const cleanupToken = fixture.uuid(seed++);
      const claimed = (await authority.query(
        'SELECT (public.enterprise_ai_claim_provider_secret_cleanup($1,$2,$3,$4,$5,$6,$7,$8)).*',
        [fixture.requester, fixture.org, fixture.workspace, operation, idempotencyKey,
          requestId, fixture.provider, cleanupToken],
      )).rows[0];
      assert.equal(claimed.id, receipt.id);
      assert.equal(Number(claimed.execution_fence), Number(receipt.execution_fence) + 1);
      assert.equal(claimed.execution_plan.cleanupRequired, true);
      assert.equal(claimed.execution_plan.cleanupTerminalCode, 'PERMISSION_DENIED');
      await assert.rejects(authority.query(
        'SELECT public.enterprise_ai_claim_provider_secret_cleanup($1,$2,$3,$4,$5,$6,$7,$8)',
        [fixture.reviewer, fixture.org, fixture.workspace, operation, idempotencyKey,
          requestId, fixture.provider, fixture.uuid(seed++)],
      ), /ENTERPRISE_AI_RECEIPT_NOT_FOUND/);
      await assert.rejects(authority.query(
        'SELECT public.enterprise_ai_claim_provider_secret_cleanup($1,$2,$3,$4,$5,$6,$7,$8)',
        [fixture.requester, fixture.org, fixture.workspace, operation, idempotencyKey,
          requestId, fixture.uuid(seed++), fixture.uuid(seed++)],
      ), /ENTERPRISE_PROVIDER_CLEANUP_NOT_ALLOWED/);

      const cleanedPlan = {...claimed.execution_plan, cleanupCompleted: true};
      await authority.query(
        'SELECT public.enterprise_ai_plan_command($1,$2,$3,$4,$5,$6::jsonb)',
        [claimed.id, fixture.org, fixture.workspace, cleanupToken,
          claimed.execution_fence, JSON.stringify(cleanedPlan)],
      );
      const terminal = (await authority.query(
        'SELECT (public.enterprise_ai_fail_command($1,$2,$3,$4,$5,$6::jsonb,true)).*',
        [claimed.id, fixture.org, fixture.workspace, cleanupToken,
          claimed.execution_fence, JSON.stringify(denied)],
      )).rows[0];
      assert.equal(terminal.status, 'blocked');
      assert.deepEqual(terminal.response, denied);
      const replay = (await authority.query(
        'SELECT (public.enterprise_ai_claim_provider_secret_cleanup($1,$2,$3,$4,$5,$6,$7,$8)).*',
        [fixture.requester, fixture.org, fixture.workspace, operation, idempotencyKey,
          requestId, fixture.provider, fixture.uuid(seed++)],
      )).rows[0];
      assert.deepEqual([replay.id, replay.status, replay.execution_fence],
        [terminal.id, 'blocked', terminal.execution_fence]);
      receiptIds.push(receipt.id);
    }
    assert.equal(Number((await authority.query(
      'SELECT count(*)::int n FROM public.enterprise_ai_effect_journal WHERE receipt_id=ANY($1::uuid[])',
      [receiptIds],
    )).rows[0].n), 2);
    assert.equal(Number((await authority.query(
      "SELECT count(*)::int n FROM public.enterprise_ai_command_receipts WHERE id=ANY($1::uuid[]) AND status='claimed'",
      [receiptIds],
    )).rows[0].n), 0);
    assert.doesNotMatch(JSON.stringify({denied}), /providerKey|rawKey|secretValue|AVALA_PROVIDER_SECRET/u);
    console.log(`PROVIDER SECRET CLEANUP RECOVERY ${JSON.stringify({
      operations: 2, cleanupClaims: 2, newerFences: 2, terminalEffects: 2,
      terminalReplays: 2, duplicateDeletes: 0, claimedFinal: 0, rawKeyInputs: 0,
    })}`);
  });
  await scenario('text-native, CSV, transcript, text-PDF, and DOCX provenance', async () => {
    const expected = new Map([
      ['text/plain', 'text_native'], ['text/markdown', 'text_native'], ['text/csv', 'csv'],
      ['text/vtt', 'vtt'], ['application/x-subrip', 'srt'], ['application/pdf', 'pdf_text'],
      ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
    ]);
    for (const source of fixture.sources.filter(item => item.parsed)) {
      const row = (await authority.query('SELECT parser_kind,extraction_status,provenance_hash FROM public.enterprise_evidence_source_versions WHERE id=$1', [source.sourceVersionId])).rows[0];
      assert.equal(row.parser_kind, expected.get(source.mimeType));
      assert.equal(row.extraction_status, 'parsed');
      assert.match(row.provenance_hash, /^[0-9a-f]{64}$/);
      assert.notEqual(row.provenance_hash, '0'.repeat(64));
    }
  });
  await scenario('deterministic source failure is receipt-recoverable and exact replay is side-effect free', async () => {
    const sourceId = fixture.uuid(720); const sourceVersionId = fixture.uuid(721);
    const request = fixture.uuid(722); const token = fixture.uuid(723); const replayRequest = fixture.uuid(724); const replayToken = fixture.uuid(725);
    const requestHash = fixture.hash('6');
    const receipt = (await authority.query(
      "SELECT (public.enterprise_ai_claim_command($1,$2,$3,'evidence.source.create','deterministic-source-failure-001',$4,$5,NULL,$6)).*",
      [fixture.requester, fixture.org, fixture.workspace, request, requestHash, token],
    )).rows[0];
    const pendingResult = {sourceId, sourceVersionId, status:'uploaded', extractedCharacterCount:0};
    const source = {id:sourceId,org_id:fixture.org,workspace_id:fixture.workspace,display_name:'Receipt scanned PDF',source_kind:'upload',mime_type:'application/pdf',created_by:fixture.requester};
    const version = {id:sourceVersionId,source_id:sourceId,org_id:fixture.org,workspace_id:fixture.workspace,original_filename:'receipt-scanned.pdf',content_hash:fixture.hash('f'),content_bytes:128,storage_bucket:'source-uploads',storage_path:`${fixture.org}/${fixture.workspace}/enterprise-evidence/${sourceId}.bin`,extracted_text_hash:null,extracted_character_count:null,created_by:fixture.requester};
    await authority.query(
      'SELECT public.enterprise_create_evidence_source_record($1::jsonb,$2::jsonb,$3,$4,$5,$6::jsonb)',
      [JSON.stringify(source), JSON.stringify(version), receipt.id, token, receipt.execution_fence, JSON.stringify(pendingResult)],
    );
    const failedResult = {sourceId,sourceVersionId,status:'failed',failureCode:'OCR_REQUIRED',extractedCharacterCount:0};
    await authority.query(
      'SELECT public.enterprise_record_source_extraction_failure($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',
      [sourceVersionId, fixture.org, fixture.workspace, 'OCR_REQUIRED', receipt.id, token, receipt.execution_fence, JSON.stringify(failedResult)],
    );
    await authority.query(
      'SELECT public.enterprise_ai_complete_command($1,$2,$3,$4,$5,$6::jsonb,$7)',
      [receipt.id, fixture.org, fixture.workspace, token, receipt.execution_fence, JSON.stringify(failedResult), sourceId],
    );
    const beforeReplay = (await authority.query('SELECT (SELECT count(*)::int FROM public.enterprise_evidence_sources WHERE id=$1) sources,(SELECT count(*)::int FROM public.enterprise_ai_effect_journal WHERE receipt_id=$2) effects', [sourceId, receipt.id])).rows[0];
    const replay = (await authority.query(
      "SELECT (public.enterprise_ai_claim_command($1,$2,$3,'evidence.source.create','deterministic-source-failure-001',$4,$5,NULL,$6)).*",
      [fixture.requester, fixture.org, fixture.workspace, replayRequest, requestHash, replayToken],
    )).rows[0];
    const afterReplay = (await authority.query('SELECT (SELECT count(*)::int FROM public.enterprise_evidence_sources WHERE id=$1) sources,(SELECT count(*)::int FROM public.enterprise_ai_effect_journal WHERE receipt_id=$2) effects,(SELECT count(*)::int FROM public.enterprise_ai_command_receipts WHERE status=\'claimed\') claimed', [sourceId, receipt.id])).rows[0];
    assert.deepEqual([replay.status,replay.response.failureCode], ['committed','OCR_REQUIRED']);
    assert.deepEqual(beforeReplay, {sources:1,effects:2});
    assert.deepEqual(afterReplay, {sources:1,effects:2,claimed:0});
    console.log(`SOURCE FAILURE RECOVERY COUNTS ${JSON.stringify({sourceRecords:1,failureTransitions:1,effects:2,replayWrites:0,claimedFinal:0})}`);
  });
  await scenario('scanned PDF records truthful OCR-required failure and immutable provenance', async () => {
    const scanned = fixture.sources.find(source => source.extension === 'scanned.pdf');
    const before = (await authority.query('SELECT provenance_hash FROM public.enterprise_evidence_source_versions WHERE id=$1', [scanned.sourceVersionId])).rows[0].provenance_hash;
    const result = (await authority.query('SELECT public.enterprise_record_source_extraction_failure($1,$2,$3,$4) result', [scanned.sourceVersionId, fixture.org, fixture.workspace, 'OCR_REQUIRED'])).rows[0].result;
    assert.equal(result.status, 'failed_ocr_required');
    const after = (await authority.query('SELECT provenance_hash,extraction_status,extraction_failure_code FROM public.enterprise_evidence_source_versions WHERE id=$1', [scanned.sourceVersionId])).rows[0];
    assert.equal(after.provenance_hash, before);
    assert.deepEqual([after.extraction_status, after.extraction_failure_code], ['failed_ocr_required', 'OCR_REQUIRED']);
    await assert.rejects(authority.query('SELECT public.enterprise_record_source_extraction_failure($1,$2,$3,$4)', [scanned.sourceVersionId, fixture.org, fixture.workspace, 'OCR_REQUIRED']), /ENTERPRISE_EVIDENCE_VERSION_CONFLICT/);
  });
  await scenario('tenant linkage, uniqueness, checks, and atomic invalid source rejection', async () => {
    const otherOrg = fixture.uuid(300); const otherWorkspace = fixture.uuid(301);
    await authority.query("INSERT INTO public.organizations(id,name,slug) VALUES($1,'Other tenant','enterprise-other')", [otherOrg]);
    await authority.query("INSERT INTO public.workspaces(id,org_id,name,slug) VALUES($1,$2,'Other workspace','enterprise-other')", [otherWorkspace, otherOrg]);
    await assert.rejects(authority.query(
      `INSERT INTO public.enterprise_ai_capability_routes(org_id,workspace_id,provider_config_id,capability,model,enabled,created_by,updated_by)
       VALUES($1,$2,$3,'assess.evidence.extract','fixture-model',true,$4,$4)`,
      [otherOrg, otherWorkspace, fixture.provider, fixture.requester],
    ), /enterprise_ai_routes_provider_org_fkey/);
    const invalidSource = fixture.uuid(302);
    await assert.rejects(authority.query('SELECT public.enterprise_create_evidence_source($1::jsonb,$2::jsonb)', [JSON.stringify({
      id: invalidSource, org_id: fixture.org, workspace_id: fixture.workspace, display_name: 'Invalid', source_kind: 'upload', mime_type: 'text/plain', created_by: fixture.requester,
    }), JSON.stringify({
      id: fixture.uuid(303), original_filename: 'invalid.txt', content_hash: fixture.hash('b'), content_bytes: 12582913,
      storage_bucket: 'source-uploads', storage_path: 'wrong/path', created_by: fixture.requester,
    })]), /ENTERPRISE_EVIDENCE_STORAGE_BINDING_INVALID|content_bytes/);
    assert.equal((await authority.query('SELECT count(*)::int n FROM public.enterprise_evidence_sources WHERE id=$1', [invalidSource])).rows[0].n, 0);
  });
  await scenario('provider/key deletion retains immutable job lineage', async () => {
    const key = fixture.uuid(310); const provider = fixture.uuid(311); const job = fixture.uuid(312);
    await authority.query("INSERT INTO public.ai_provider_key_refs(id,org_id,provider,secret_ref,status) VALUES($1,$2,'openai','fixture/delete/reference','active')", [key, fixture.org]);
    await authority.query("INSERT INTO public.ai_provider_configs(id,org_id,provider,display_name,key_ref_id,status) VALUES($1,$2,'openai','Delete semantics',$3,'active')", [provider, fixture.org, key]);
    await authority.query(`INSERT INTO public.enterprise_ai_job_ledger(id,org_id,workspace_id,capability,provider_config_id,provider,model,prompt_key,prompt_version,actor_id,request_id,idempotency_key,status,approval_state)
      VALUES($1,$2,$3,'assess.evidence.extract',$4,'openai','fixture-model','delete-test','1',$5,$6,'delete-provider-001','failed','review_required')`, [job, fixture.org, fixture.workspace, provider, fixture.requester, fixture.uuid(313)]);
    await authority.query('DELETE FROM public.ai_provider_key_refs WHERE id=$1', [key]);
    assert.equal((await authority.query('SELECT key_ref_id FROM public.ai_provider_configs WHERE id=$1', [provider])).rows[0].key_ref_id, null);
    await authority.query('DELETE FROM public.ai_provider_configs WHERE id=$1', [provider]);
    assert.equal((await authority.query('SELECT provider_config_id FROM public.enterprise_ai_job_ledger WHERE id=$1', [job])).rows[0].provider_config_id, null);
  });
  await scenario('idempotent command replay and conflicting update rejection', async () => {
    const request = fixture.uuid(320); const hash = fixture.hash('c');
    const first = (await authority.query('SELECT (public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,$8)).*', [fixture.requester, fixture.org, fixture.workspace, 'provider.register', 'fixture-command-001', request, hash, null])).rows[0];
    const replay = (await authority.query('SELECT (public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,$8)).*', [fixture.requester, fixture.org, fixture.workspace, 'provider.register', 'fixture-command-001', request, hash, null])).rows[0];
    assert.equal(replay.id, first.id);
    await assert.rejects(authority.query('SELECT public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,$8)', [fixture.requester, fixture.org, fixture.workspace, 'provider.register', 'fixture-command-001', fixture.uuid(321), fixture.hash('d'), null]), /ENTERPRISE_AI_IDEMPOTENCY_CONFLICT/);
    await authority.query("SELECT public.enterprise_ai_complete_command($1,$2,$3,'{\"ok\":true}'::jsonb,NULL)", [first.id, fixture.org, fixture.workspace]);
    const exactCompletionReplay = (await authority.query("SELECT (public.enterprise_ai_complete_command($1,$2,$3,'{\"ok\":true}'::jsonb,NULL)).*", [first.id, fixture.org, fixture.workspace])).rows[0];
    assert.equal(exactCompletionReplay.status, 'committed');
    await assert.rejects(authority.query("SELECT public.enterprise_ai_complete_command($1,$2,$3,'{}'::jsonb,NULL)", [first.id, fixture.org, fixture.workspace]), /ENTERPRISE_AI_IDEMPOTENCY_CONFLICT/);
  });
  await scenario('request correlation, response loss, stranded effects, and fenced recovery converge', async () => {
    const claim = async (client, {key, request, token, hash, command = 'provider.register'}) => (
      await client.query(
        'SELECT (public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,NULL,$8)).*',
        [fixture.requester, fixture.org, fixture.workspace, command, key, request, hash, token],
      )
    ).rows[0];

    const logicalHash = fixture.hash('e');
    const ownerToken = fixture.uuid(601);
    const first = await claim(authority, {
      key: 'request-correlation-001', request: fixture.uuid(602), token: ownerToken, hash: logicalHash,
    });
    const differentRequestReplay = await claim(authority, {
      key: 'request-correlation-001', request: fixture.uuid(603), token: fixture.uuid(604), hash: logicalHash,
    });
    assert.equal(differentRequestReplay.id, first.id);
    assert.equal(differentRequestReplay.execution_token, ownerToken);
    assert.equal((await authority.query('SELECT count(*)::int n FROM public.enterprise_ai_receipt_replay_requests WHERE receipt_id=$1', [first.id])).rows[0].n, 2);
    await assert.rejects(claim(authority, {
      key: 'request-correlation-001', request: fixture.uuid(605), token: fixture.uuid(606), hash: fixture.hash('f'),
    }), /ENTERPRISE_AI_IDEMPOTENCY_CONFLICT/);

    const committedResult = {truth: 'committed-after-lost-response'};
    await authority.query(
      'SELECT public.enterprise_ai_complete_command($1,$2,$3,$4,$5,$6::jsonb,NULL)',
      [first.id, fixture.org, fixture.workspace, ownerToken, first.execution_fence, JSON.stringify(committedResult)],
    );
    const completionReplay = (await authority.query(
      'SELECT (public.enterprise_ai_complete_command($1,$2,$3,$4,$5,$6::jsonb,NULL)).*',
      [first.id, fixture.org, fixture.workspace, ownerToken, first.execution_fence, JSON.stringify(committedResult)],
    )).rows[0];
    assert.equal(completionReplay.status, 'committed');
    assert.deepEqual(completionReplay.response, committedResult);

    const strandedToken = fixture.uuid(607);
    const stranded = await claim(authority, {
      key: 'stranded-effect-001', request: fixture.uuid(608), token: strandedToken, hash: fixture.hash('1'), command: 'monitor.baseline.create',
    });
    const strandedResult = {baselineId: fixture.uuid(609), status: 'approval_required'};
    await authority.query(
      "SELECT public.enterprise_ai_record_effect($1,$2,$3,$4,$5,'monitor.baseline.create','command',$6,$7::jsonb,'committed')",
      [stranded.id, fixture.org, fixture.workspace, strandedToken, stranded.execution_fence, strandedResult.baselineId, JSON.stringify(strandedResult)],
    );
    const reconciledByClaim = await claim(authority, {
      key: 'stranded-effect-001', request: fixture.uuid(610), token: fixture.uuid(611), hash: fixture.hash('1'), command: 'monitor.baseline.create',
    });
    assert.equal(reconciledByClaim.status, 'committed');
    assert.deepEqual(reconciledByClaim.response, strandedResult);

    const failedToken = fixture.uuid(612);
    const failed = await claim(authority, {
      key: 'failure-response-loss-001', request: fixture.uuid(613), token: failedToken, hash: fixture.hash('2'),
    });
    const failureResult = {ok: false, error: {code: 'COMMAND_BLOCKED'}};
    await authority.query(
      'SELECT public.enterprise_ai_fail_command($1,$2,$3,$4,$5,$6::jsonb,true)',
      [failed.id, fixture.org, fixture.workspace, failedToken, failed.execution_fence, JSON.stringify(failureResult)],
    );
    const failureReplay = (await authority.query(
      'SELECT (public.enterprise_ai_fail_command($1,$2,$3,$4,$5,$6::jsonb,true)).*',
      [failed.id, fixture.org, fixture.workspace, failedToken, failed.execution_fence, JSON.stringify(failureResult)],
    )).rows[0];
    assert.equal(failureReplay.status, 'blocked');

    const leaseToken = fixture.uuid(614);
    const leased = await claim(authority, {
      key: 'fenced-recovery-001', request: fixture.uuid(615), token: leaseToken, hash: fixture.hash('3'), command: 'assemble.blueprint.create',
    });
    await authority.query(
      'SELECT public.enterprise_ai_plan_command($1,$2,$3,$4,$5,$6::jsonb)',
      [leased.id, fixture.org, fixture.workspace, leaseToken, leased.execution_fence, JSON.stringify({blueprintId: fixture.uuid(616)})],
    );
    await authority.query("UPDATE public.enterprise_ai_command_receipts SET lease_expires_at=statement_timestamp()-interval '1 second' WHERE id=$1", [leased.id]);
    const peer = await connect(urlFor(names.authority));
    const contenders = await Promise.all([
      claim(authority, {key: 'fenced-recovery-001', request: fixture.uuid(617), token: fixture.uuid(618), hash: fixture.hash('3'), command: 'assemble.blueprint.create'}),
      claim(peer, {key: 'fenced-recovery-001', request: fixture.uuid(619), token: fixture.uuid(620), hash: fixture.hash('3'), command: 'assemble.blueprint.create'}),
    ]);
    assert.equal(new Set(contenders.map(row => row.execution_token)).size, 1);
    assert.equal(new Set(contenders.map(row => Number(row.execution_fence))).size, 1);
    const winner = contenders[0];
    assert.equal(Number(winner.execution_fence), Number(leased.execution_fence) + 1);
    assert.deepEqual(winner.execution_plan, {blueprintId: fixture.uuid(616)});
    await assert.rejects(authority.query(
      'SELECT public.enterprise_ai_complete_command($1,$2,$3,$4,$5,$6::jsonb,$7)',
      [leased.id, fixture.org, fixture.workspace, leaseToken, leased.execution_fence, JSON.stringify({blueprintId: fixture.uuid(616)}), fixture.uuid(616)],
    ), /ENTERPRISE_AI_STALE_EXECUTION_FENCE/);
    await authority.query(
      'SELECT public.enterprise_ai_complete_command($1,$2,$3,$4,$5,$6::jsonb,$7)',
      [leased.id, fixture.org, fixture.workspace, winner.execution_token, winner.execution_fence, JSON.stringify({blueprintId: fixture.uuid(616)}), fixture.uuid(616)],
    );

    const counts = (await authority.query(`SELECT
      (SELECT count(*)::int FROM public.enterprise_ai_command_receipts WHERE status='claimed') claimed,
      (SELECT count(*)::int FROM public.enterprise_ai_effect_journal) effects,
      (SELECT count(*)::int FROM (SELECT receipt_id,effect_key,count(*) FROM public.enterprise_ai_effect_journal GROUP BY receipt_id,effect_key HAVING count(*)>1) duplicate) duplicate_effects`)).rows[0];
    assert.equal(counts.claimed, 0);
    assert.equal(counts.duplicate_effects, 0);
    await assert.rejects(authority.query('UPDATE public.enterprise_ai_effect_journal SET safe_result=safe_result WHERE receipt_id=$1', [first.id]), /ENTERPRISE_AI_EFFECT_JOURNAL_IMMUTABLE/);
    console.log(`RECEIPT RECOVERY COUNTS ${JSON.stringify({claimedFinal:counts.claimed,duplicateEffects:counts.duplicate_effects,effectRows:counts.effects,replayRequests:2,recoveryWinners:1})}`);
  });
  await scenario('exhaustive command runtime-area classification', async () => {
    const matrix = [
      ['provider.register', null, 'provider'], ['provider.validate', null, 'provider'],
      ['provider.activate', null, 'provider'], ['provider.route.toggle', null, 'provider'],
      ['provider.revoke', null, 'provider'], ['evidence.source.create', null, 'ingestion'],
      ['evidence.extract', null, 'ingestion'], ['evidence.candidate.review', null, 'ingestion'],
      ['evidence.assess.promote', null, 'ingestion'], ['modernization.evaluate', null, 'delivery'],
      ['studio.delivery.handoff', null, 'delivery'], ['monitor.baseline.create', null, 'delivery'],
      ['approval.review.record', 'delivery_work_package', 'delivery'],
      ['approval.record', 'monitor_baseline', 'delivery'],
      ['assemble.blueprint.create', null, 'assemble'],
      ['approval.review.record', 'assemble_blueprint', 'assemble'],
      ['approval.record', 'assemble_blueprint', 'assemble'],
    ];
    for (const [commandType, resourceType, expectedArea] of matrix) {
      const actual = (await authority.query('SELECT public.enterprise_command_runtime_area($1,$2) area', [commandType, resourceType])).rows[0].area;
      assert.equal(actual, expectedArea, `${commandType}:${resourceType || '-'}`);
    }
    await assert.rejects(authority.query('SELECT public.enterprise_command_runtime_area($1,$2)', ['unknown.command', null]), /ENTERPRISE_AI_INVALID_COMMAND_AREA/);
    await assert.rejects(authority.query('SELECT public.enterprise_command_runtime_area($1,$2)', ['approval.record', null]), /ENTERPRISE_AI_INVALID_COMMAND_AREA/);
    console.log(`COMMAND AREA MATRIX ${JSON.stringify(matrix.map(([commandType, resourceType, runtimeArea]) => ({commandType, resourceType, runtimeArea})))}`);
  });
  await scenario('area disablement blocks only its new commands before receipts or effects', async () => {
    const countEffects = async () => {
      const row = (await authority.query(`SELECT
        (SELECT count(*)::int FROM public.enterprise_ai_command_receipts) receipts,
        (SELECT count(*)::int FROM public.enterprise_ai_job_ledger) provider_effects,
        (SELECT count(*)::int FROM public.enterprise_evidence_sources) source_storage_effects,
        (SELECT count(*)::int FROM public.enterprise_evidence_assess_promotions) promotion_effects,
        (SELECT count(*)::int FROM public.enterprise_delivery_work_packages) package_effects,
        (SELECT count(*)::int FROM public.enterprise_monitor_baselines) baseline_effects,
        (SELECT count(*)::int FROM public.enterprise_assemble_blueprints) blueprint_effects`)).rows[0];
      return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
    };
    const claim = async (commandType, key, seed, resourceType = null) => (
      await authority.query(
        'SELECT (public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,$8)).*',
        [fixture.requester, fixture.org, fixture.workspace, commandType, key, fixture.uuid(seed), fixture.hash(String(seed % 10)), resourceType],
      )
    ).rows[0];
    const blocked = {provider: 0, ingestion: 0, delivery: 0, assemble: 0};
    const before = await countEffects();
    await authority.query('UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=false WHERE singleton=true');
    await assert.rejects(claim('provider.register', 'blocked-provider-001', 500), /ENTERPRISE_INTELLIGENCE_PROVIDER_DISABLED/); blocked.provider += 1;
    const ingestion = await claim('evidence.source.create', 'allowed-ingestion-001', 501);
    const delivery = await claim('monitor.baseline.create', 'allowed-delivery-001', 502);
    const assemble = await claim('assemble.blueprint.create', 'allowed-assemble-001', 503);
    for (const receipt of [ingestion, delivery, assemble]) {
      await authority.query("SELECT public.enterprise_ai_complete_command($1,$2,$3,'{\"ok\":true}'::jsonb,NULL)", [receipt.id, fixture.org, fixture.workspace]);
    }
    await authority.query('UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=true,ingestion_enabled=false WHERE singleton=true');
    for (const [index, commandType] of ['evidence.source.create','evidence.extract','evidence.candidate.review','evidence.assess.promote'].entries()) {
      await assert.rejects(claim(commandType, `blocked-ingestion-${index + 1}-001`, 510 + index), /ENTERPRISE_INTELLIGENCE_INGESTION_DISABLED/); blocked.ingestion += 1;
    }
    await authority.query('UPDATE public.enterprise_intelligence_runtime_control SET ingestion_enabled=true,delivery_enabled=false WHERE singleton=true');
    const deliveryCommands = [
      ['modernization.evaluate', null], ['studio.delivery.handoff', null], ['monitor.baseline.create', null],
      ['approval.review.record', 'delivery_work_package'], ['approval.record', 'monitor_baseline'],
    ];
    for (const [index, [commandType, resourceType]] of deliveryCommands.entries()) {
      await assert.rejects(claim(commandType, `blocked-delivery-${index + 1}-001`, 520 + index, resourceType), /ENTERPRISE_INTELLIGENCE_DELIVERY_DISABLED/); blocked.delivery += 1;
    }
    await authority.query('UPDATE public.enterprise_intelligence_runtime_control SET delivery_enabled=true,assemble_enabled=false WHERE singleton=true');
    const assembleCommands = [
      ['assemble.blueprint.create', null], ['approval.review.record', 'assemble_blueprint'], ['approval.record', 'assemble_blueprint'],
    ];
    for (const [index, [commandType, resourceType]] of assembleCommands.entries()) {
      await assert.rejects(claim(commandType, `blocked-assemble-${index + 1}-001`, 530 + index, resourceType), /ENTERPRISE_INTELLIGENCE_ASSEMBLE_DISABLED/); blocked.assemble += 1;
    }
    await authority.query('UPDATE public.enterprise_intelligence_runtime_control SET assemble_enabled=true WHERE singleton=true');
    const after = await countEffects();
    assert.equal(after.receipts - before.receipts, 3);
    const blockedReceiptDelta = after.receipts - before.receipts - 3;
    assert.equal(blockedReceiptDelta, 0);
    for (const key of ['provider_effects','source_storage_effects','promotion_effects','package_effects','baseline_effects','blueprint_effects']) assert.equal(after[key], before[key], key);
    assert.equal((await authority.query("SELECT count(*)::int n FROM public.enterprise_ai_command_receipts WHERE status='claimed'")).rows[0].n, 0);
    console.log(`BLOCKED COMMAND COUNTS ${JSON.stringify({blocked,blockedReceiptDelta,allowedReceiptDelta:3,effectDeltas:Object.fromEntries(['provider_effects','source_storage_effects','promotion_effects','package_effects','baseline_effects','blueprint_effects'].map(key => [key, after[key] - before[key]]))})}`);
  });
  await scenario('read-only blocks every new command but committed exact replay remains truthful', async () => {
    const claim = async (commandType, key, seed, hash, resourceType = null) => (
      await authority.query('SELECT (public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,$8)).*', [fixture.requester, fixture.org, fixture.workspace, commandType, key, fixture.uuid(seed), hash, resourceType])
    ).rows[0];
    const replayHash = fixture.hash('8');
    const committed = await claim('provider.validate', 'readonly-replay-001', 540, replayHash);
    await authority.query("SELECT public.enterprise_ai_complete_command($1,$2,$3,'{\"truth\":\"committed\"}'::jsonb,NULL)", [committed.id, fixture.org, fixture.workspace]);
    const before = Number((await authority.query('SELECT count(*)::int n FROM public.enterprise_ai_command_receipts')).rows[0].n);
    await authority.query('UPDATE public.enterprise_intelligence_runtime_control SET read_only=true WHERE singleton=true');
    const matrix = [
      ['provider.register', null], ['provider.validate', null], ['provider.activate', null], ['provider.route.toggle', null], ['provider.revoke', null],
      ['evidence.source.create', null], ['evidence.extract', null], ['evidence.candidate.review', null], ['evidence.assess.promote', null],
      ['modernization.evaluate', null], ['studio.delivery.handoff', null], ['monitor.baseline.create', null],
      ['approval.review.record', 'delivery_work_package'], ['approval.record', 'monitor_baseline'],
      ['assemble.blueprint.create', null], ['approval.review.record', 'assemble_blueprint'], ['approval.record', 'assemble_blueprint'],
    ];
    for (const [index, [commandType, resourceType]] of matrix.entries()) {
      await assert.rejects(claim(commandType, `readonly-new-${index + 1}-001`, 550 + index, fixture.hash(String((index + 1) % 10)), resourceType), /ENTERPRISE_INTELLIGENCE_READ_ONLY/);
    }
    const replay = await claim('provider.validate', 'readonly-replay-001', 540, replayHash);
    assert.deepEqual([replay.id, replay.status, replay.response.truth], [committed.id, 'committed', 'committed']);
    assert.equal(Number((await authority.query('SELECT count(*)::int n FROM public.enterprise_ai_command_receipts')).rows[0].n), before);
    await authority.query('UPDATE public.enterprise_intelligence_runtime_control SET read_only=false WHERE singleton=true');
    console.log(`READ ONLY COUNTS ${JSON.stringify({blockedNewCommands:matrix.length,receiptDelta:0,replayStatus:replay.status})}`);
  });
  await scenario('post-commit control change finalizes truthfully and replay is effect-free', async () => {
    const request = fixture.uuid(580); const hash = fixture.hash('9');
    const receipt = (await authority.query('SELECT (public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,$8)).*', [fixture.requester, fixture.org, fixture.workspace, 'evidence.candidate.review', 'post-commit-control-001', request, hash, null])).rows[0];
    assert.equal(receipt.status, 'claimed');
    const effectId = fixture.uuid(581);
    const beforeEffects = Number((await authority.query('SELECT count(*)::int n FROM public.enterprise_evidence_questions')).rows[0].n);
    await authority.query("INSERT INTO public.enterprise_evidence_questions(id,source_id,org_id,workspace_id,question,status,created_by) VALUES($1,$2,$3,$4,'Post-commit truth fixture','open',$5)", [effectId, fixture.sources[0].sourceId, fixture.org, fixture.workspace, fixture.requester]);
    await authority.query('UPDATE public.enterprise_intelligence_runtime_control SET ingestion_enabled=false WHERE singleton=true');
    assert.equal((await authority.query('SELECT status FROM public.enterprise_ai_command_receipts WHERE id=$1', [receipt.id])).rows[0]?.status, 'claimed');
    const completed = (await authority.query("SELECT completed.* FROM public.enterprise_ai_complete_command($1,$2,$3,'{\"outcome\":\"committed\"}'::jsonb,$4) completed", [receipt.id, fixture.org, fixture.workspace, effectId])).rows[0];
    assert.deepEqual([completed.status, completed.response.outcome], ['committed', 'committed']);
    const replay = (await authority.query('SELECT (public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,$8)).*', [fixture.requester, fixture.org, fixture.workspace, 'evidence.candidate.review', 'post-commit-control-001', request, hash, null])).rows[0];
    assert.deepEqual([replay.id, replay.status, replay.response.outcome], [receipt.id, 'committed', 'committed']);
    assert.equal(Number((await authority.query('SELECT count(*)::int n FROM public.enterprise_evidence_questions')).rows[0].n), beforeEffects + 1);
    await assert.rejects(authority.query('SELECT public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,$8)', [fixture.requester, fixture.org, fixture.workspace, 'evidence.candidate.review', 'post-commit-control-001', request, fixture.hash('0'), null]), /ENTERPRISE_AI_IDEMPOTENCY_CONFLICT/);
    await authority.query('UPDATE public.enterprise_intelligence_runtime_control SET ingestion_enabled=true WHERE singleton=true');
    console.log(`POST COMMIT CONTROL CHANGE ${JSON.stringify({receiptStatus:completed.status,effectDelta:1,replayStatus:replay.status,duplicateEffects:0,conflict:'ENTERPRISE_AI_IDEMPOTENCY_CONFLICT'})}`);
  });
  await scenario('terminal failure finalizes while disabled and no claimed receipts remain', async () => {
    const receipt = (await authority.query('SELECT (public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,$8)).*', [fixture.requester, fixture.org, fixture.workspace, 'assemble.blueprint.create', 'disabled-failure-001', fixture.uuid(590), fixture.hash('7'), null])).rows[0];
    await authority.query('UPDATE public.enterprise_intelligence_runtime_control SET assemble_enabled=false WHERE singleton=true');
    const failed = (await authority.query("SELECT failed.* FROM public.enterprise_ai_fail_command($1,$2,$3,'{\"code\":\"TERMINAL_FIXTURE_FAILURE\"}'::jsonb,false) failed", [receipt.id, fixture.org, fixture.workspace])).rows[0];
    assert.deepEqual([failed.status, failed.response.code], ['failed', 'TERMINAL_FIXTURE_FAILURE']);
    await authority.query('UPDATE public.enterprise_intelligence_runtime_control SET assemble_enabled=true WHERE singleton=true');
    const claimed = Number((await authority.query("SELECT count(*)::int n FROM public.enterprise_ai_command_receipts WHERE status='claimed'")).rows[0].n);
    assert.equal(claimed, 0);
    console.log(`RECEIPT FINALIZATION COUNTS ${JSON.stringify({failedWhileDisabled:1,claimedFinal:claimed})}`);
  });
  await scenario('candidate batch promotion is atomic, replayable, and draft-serialized', async () => {
    const source = fixture.sources[0];
    const otherSource = fixture.sources[1];
    const authorizationVersion = Number((await authority.query(
      'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',
      [fixture.org, fixture.requester],
    )).rows[0].version);
    let ordinal = 500;
    const nextId = () => fixture.uuid(ordinal++);
    const createdReceiptIds = [];
    const createCase = async (currentVersion = 1) => {
      const processId = nextId(); const caseId = nextId(); const firstVersionId = nextId();
      await authority.query(
        "INSERT INTO public.assess_processes(id,org_id,workspace_id,name,status) VALUES($1,$2,$3,'Atomic promotion process','Draft')",
        [processId, fixture.org, fixture.workspace],
      );
      await authority.query(
        "INSERT INTO public.assess_v2_cases(id,org_id,workspace_id,process_id,owner_id,status,version) VALUES($1,$2,$3,$4,$5,'draft',1)",
        [caseId, fixture.org, fixture.workspace, processId, fixture.requester],
      );
      await authority.query(
        "INSERT INTO public.assess_v2_case_versions(id,case_id,org_id,workspace_id,version,name,source_kind,created_by) VALUES($1,$2,$3,$4,1,'Atomic promotion fixture','create',$5)",
        [firstVersionId, caseId, fixture.org, fixture.workspace, fixture.requester],
      );
      await authority.query('UPDATE public.assess_v2_cases SET head_version_id=$1 WHERE id=$2', [firstVersionId, caseId]);
      if (currentVersion === 2) {
        const secondVersionId = nextId();
        await authority.query(
          "INSERT INTO public.assess_v2_case_versions(id,case_id,org_id,workspace_id,version,name,source_kind,created_by) VALUES($1,$2,$3,$4,2,'Changed atomic promotion fixture','draft_upsert',$5)",
          [secondVersionId, caseId, fixture.org, fixture.workspace, fixture.requester],
        );
        await authority.query('UPDATE public.assess_v2_cases SET version=2,head_version_id=$1 WHERE id=$2', [secondVersionId, caseId]);
      }
      return caseId;
    };
    const createCandidate = async ({selectedSource = source, status = 'accepted', version = 1} = {}) => {
      const id = nextId();
      const safeExcerpt = `Atomic evidence excerpt ${id}`;
      await authority.query(
        `INSERT INTO public.enterprise_evidence_candidates(
           id,source_id,source_version_id,org_id,workspace_id,field_key,value,safe_excerpt,
           excerpt_hash,provenance_hash,version,source_locator,confidence,suggestion_status,
           created_by,reviewed_by,reviewed_at
         ) VALUES($1,$2,$3,$4,$5,'process_objective',$6,$7,$8,$8,$9,'line:1-1',0.95,$10,$11,$12,statement_timestamp())`,
        [id, selectedSource.sourceId, selectedSource.sourceVersionId, fixture.org, fixture.workspace,
          `Atomic candidate ${id}`, safeExcerpt, fixture.hash('0'), version, status, fixture.requester, fixture.reviewer],
      );
      return id;
    };
    const candidatePlan = async candidateIds => {
      const rows = (await authority.query(
        'SELECT id,version,provenance_hash FROM public.enterprise_evidence_candidates WHERE id=ANY($1::uuid[])',
        [candidateIds],
      )).rows;
      const byId = new Map(rows.map(row => [row.id, row]));
      return candidateIds.map(candidateId => ({
        candidateId,
        expectedVersion: Number(byId.get(candidateId).version),
        provenanceHash: byId.get(candidateId).provenance_hash,
      }));
    };
    const createReceipt = async (caseId, startVersion, candidates, key, client = authority) => {
      const requestId = nextId(); const executionToken = nextId(); const requestHash = fixture.hash('8');
      const receipt = (await client.query(
        'SELECT (public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,$8,$9)).*',
        [fixture.requester, fixture.org, fixture.workspace, 'evidence.assess.promote', key,
          requestId, requestHash, null, executionToken],
      )).rows[0];
      const plan = {
        promotionSourceId: source.sourceId,
        promotionStartVersion: startVersion,
        promotionCandidateIds: [...candidates.map(item => item.candidateId)].sort(),
        promotionCandidates: candidates,
      };
      const planned = (await client.query(
        'SELECT (public.enterprise_ai_plan_command($1,$2,$3,$4,$5,$6::jsonb)).*',
        [receipt.id, fixture.org, fixture.workspace, receipt.execution_token,
          Number(receipt.execution_fence), JSON.stringify(plan)],
      )).rows[0];
      createdReceiptIds.push(planned.id);
      return {...planned, key, requestHash, caseId, startVersion, candidates};
    };
    const promote = (receipt, client = authority, selectedSource = source.sourceId) => client.query(
      'SELECT public.enterprise_promote_evidence_batch_to_assess_v2($1,$2::jsonb,$3,$4,$5,$6,$7,$8,$9,$10,$11) result',
      [selectedSource, JSON.stringify(receipt.candidates), receipt.caseId, receipt.startVersion,
        fixture.requester, fixture.org, fixture.workspace, authorizationVersion,
        receipt.id, receipt.execution_token, Number(receipt.execution_fence)],
    );
    const failReceipt = receipt => authority.query(
      'SELECT public.enterprise_ai_fail_command($1,$2,$3,$4,$5,$6::jsonb,false)',
      [receipt.id, fixture.org, fixture.workspace, receipt.execution_token,
        Number(receipt.execution_fence), JSON.stringify({ok:false,error:{code:'COMMAND_BLOCKED'}})],
    );
    const caseCounts = async (caseId, receiptIds) => (await authority.query(
      `SELECT
         (SELECT count(*)::int FROM public.assess_v2_case_versions WHERE case_id=$1) case_versions,
         (SELECT count(*)::int FROM public.enterprise_evidence_assess_promotions WHERE assess_case_id=$1) promotions,
         (SELECT count(*)::int FROM public.privileged_audit_events WHERE resource_id=$1 AND action='evidence.candidate.promote') audits,
         (SELECT count(*)::int FROM public.enterprise_ai_effect_journal WHERE receipt_id=ANY($2::uuid[]) AND terminal_status='committed') effects`,
      [caseId, receiptIds],
    )).rows[0];

    const successCase = await createCase();
    const successIds = [await createCandidate(), await createCandidate(), await createCandidate()];
    const orderedSuccessIds = [successIds[2], successIds[0], successIds[1]];
    const successReceipt = await createReceipt(
      successCase, 1, await candidatePlan(orderedSuccessIds), 'atomic-promotion-success-001',
    );
    const success = (await promote(successReceipt)).rows[0].result;
    assert.equal(success.resourceId, successCase);
    assert.deepEqual(success.candidateIds, orderedSuccessIds);
    assert.equal(Number(success.startVersion), 1);
    assert.equal(Number(success.finalVersion), 4);
    assert.equal(Number(success.promotedCandidateCount), 3);
    assert.equal(success.promotionIds.length, 3);
    assert.deepEqual(await caseCounts(successCase, [successReceipt.id]), {
      case_versions: 4, promotions: 3, audits: 3, effects: 1,
    });

    const committedEffect = (await authority.query(
      "SELECT resource_id,safe_result FROM public.enterprise_ai_effect_journal WHERE receipt_id=$1 AND effect_key='command'",
      [successReceipt.id],
    )).rows[0];
    assert.equal(committedEffect.resource_id, successCase);
    assert.equal(committedEffect.safe_result.resourceId, successCase);

    // Simulate response loss: domain/effect committed while the outer receipt is still claimed.
    assert.equal((await authority.query('SELECT status FROM public.enterprise_ai_command_receipts WHERE id=$1', [successReceipt.id])).rows[0].status, 'claimed');
    const mismatchedResponse = {...success, resourceId: source.sourceId};
    await assert.rejects(authority.query(
      'SELECT public.enterprise_ai_reconcile_command($1,$2,$3,$4::jsonb,$5)',
      [successReceipt.id, fixture.org, fixture.workspace, JSON.stringify(mismatchedResponse), source.sourceId],
    ), /ENTERPRISE_AI_IDEMPOTENCY_CONFLICT/);
    assert.deepEqual(await caseCounts(successCase, [successReceipt.id]), {
      case_versions: 4, promotions: 3, audits: 3, effects: 1,
    });
    const recovered = (await authority.query(
      'SELECT (public.enterprise_ai_reconcile_command($1,$2,$3,$4::jsonb,$5)).*',
      [successReceipt.id, fixture.org, fixture.workspace, JSON.stringify(success), successCase],
    )).rows[0];
    assert.equal(recovered.status, 'committed');
    assert.equal(recovered.resource_id, successCase);
    assert.equal(recovered.response.resourceId, successCase);
    assert.deepEqual(recovered.response, success);
    const finalized = (await authority.query(
      'SELECT (public.enterprise_ai_complete_command($1,$2,$3,$4,$5,$6::jsonb,$7)).*',
      [successReceipt.id, fixture.org, fixture.workspace, successReceipt.execution_token,
        Number(successReceipt.execution_fence), JSON.stringify(success), successCase],
    )).rows[0];
    assert.equal(finalized.id, successReceipt.id);
    assert.equal(finalized.resource_id, successCase);
    assert.deepEqual(finalized.response, success);
    const replay = (await authority.query(
      'SELECT (public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,$8,$9)).*',
      [fixture.requester, fixture.org, fixture.workspace, 'evidence.assess.promote', successReceipt.key,
        nextId(), successReceipt.requestHash, null, nextId()],
    )).rows[0];
    assert.equal(replay.status, 'committed');
    assert.deepEqual(await caseCounts(successCase, [successReceipt.id]), {
      case_versions: 4, promotions: 3, audits: 3, effects: 1,
    });

    const assertAtomicRejection = async ({caseId, ids, plan, key, expected, selectedSource = source.sourceId, startVersion = 1}) => {
      const receipt = await createReceipt(caseId, startVersion, plan || await candidatePlan(ids), key);
      await assert.rejects(promote(receipt, authority, selectedSource), expected);
      assert.deepEqual(await caseCounts(caseId, [receipt.id]), {
        case_versions: startVersion === 1 ? 1 : 2, promotions: 0, audits: 0, effects: 0,
      });
      await failReceipt(receipt);
      return receipt;
    };

    const staleCase = await createCase();
    const staleIds = [await createCandidate(), await createCandidate(), await createCandidate()];
    const stalePlan = await candidatePlan(staleIds);
    stalePlan[2] = {...stalePlan[2], provenanceHash: fixture.hash('f')};
    await assertAtomicRejection({caseId:staleCase,ids:staleIds,plan:stalePlan,key:'atomic-promotion-stale-final',expected:/ENTERPRISE_EVIDENCE_CANDIDATE_STALE/});

    const editedCase = await createCase();
    const editedIds = [await createCandidate(), await createCandidate(), await createCandidate({status:'edited',version:2})];
    await assertAtomicRejection({caseId:editedCase,ids:editedIds,key:'atomic-promotion-edit-history',expected:/ENTERPRISE_EVIDENCE_EDIT_HISTORY_REQUIRED/});

    const crossSourceCase = await createCase();
    const crossSourceIds = [await createCandidate(), await createCandidate(), await createCandidate({selectedSource:otherSource})];
    await assertAtomicRejection({caseId:crossSourceCase,ids:crossSourceIds,key:'atomic-promotion-cross-source',expected:/ENTERPRISE_EVIDENCE_CANDIDATE_STALE/});

    const promotedAgainCase = await createCase();
    await assertAtomicRejection({caseId:promotedAgainCase,ids:[successIds[0]],key:'atomic-promotion-already-promoted',expected:/ENTERPRISE_EVIDENCE_ALREADY_PROMOTED/});

    const changedCase = await createCase(2);
    const changedIds = [await createCandidate()];
    const changedReceipt = await createReceipt(changedCase, 1, await candidatePlan(changedIds), 'atomic-promotion-draft-changed');
    await assert.rejects(promote(changedReceipt), /ENTERPRISE_EVIDENCE_ASSESS_VERSION_CONFLICT/);
    assert.deepEqual(await caseCounts(changedCase, [changedReceipt.id]), {case_versions:2,promotions:0,audits:0,effects:0});
    await failReceipt(changedReceipt);

    const concurrentCase = await createCase();
    const concurrentIds = [await createCandidate(), await createCandidate(), await createCandidate()];
    const concurrentPlan = await candidatePlan(concurrentIds);
    const contender = await connect(urlFor(names.authority));
    const left = await createReceipt(concurrentCase, 1, concurrentPlan, 'atomic-promotion-concurrent-left');
    const right = await createReceipt(concurrentCase, 1, concurrentPlan, 'atomic-promotion-concurrent-right', contender);
    const concurrent = await Promise.allSettled([promote(left), promote(right, contender)]);
    assert.equal(concurrent.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal(concurrent.filter(item => item.status === 'rejected').length, 1);
    assert.match(String(concurrent.find(item => item.status === 'rejected').reason), /ENTERPRISE_EVIDENCE_ASSESS_VERSION_CONFLICT/);
    const effectRows = (await authority.query(
      'SELECT receipt_id FROM public.enterprise_ai_effect_journal WHERE receipt_id=ANY($1::uuid[])',
      [[left.id, right.id]],
    )).rows;
    assert.equal(effectRows.length, 1);
    const winner = effectRows[0].receipt_id === left.id ? left : right;
    const loser = winner.id === left.id ? right : left;
    await authority.query('SELECT public.enterprise_ai_reload_command($1,$2,$3)', [winner.id, fixture.org, fixture.workspace]);
    await failReceipt(loser);
    assert.deepEqual(await caseCounts(concurrentCase, [left.id, right.id]), {
      case_versions: 4, promotions: 3, audits: 3, effects: 1,
    });
    assert.equal(Number((await authority.query('SELECT version FROM public.assess_v2_cases WHERE id=$1', [concurrentCase])).rows[0].version), 4);

    const claimedFinal = Number((await authority.query(
      "SELECT count(*)::int n FROM public.enterprise_ai_command_receipts WHERE id=ANY($1::uuid[]) AND status='claimed'",
      [createdReceiptIds],
    )).rows[0].n);
    assert.equal(claimedFinal, 0);
    console.log(`ATOMIC PROMOTION COUNTS ${JSON.stringify({
      committedCandidates:3, successCaseVersion:4, failureVersionDelta:0,
      failurePromotionDelta:0, failureAuditDelta:0, failureEffectDelta:0,
      receiptResourceId:successCase, effectResourceId:committedEffect.resource_id,
      mismatchedResourceRejections:1, replayAdditionalWrites:0,
      concurrentWinners:1, concurrentLosers:1,
      concurrentFinalVersion:4, claimedFinal,
    })}`);
  });
  await scenario('changed resources invalidate canonical reviews until a new independent review', async () => {
    const candidate = fixture.uuid(730);
    const source = fixture.sources[0];
    const initialHash = fixture.hash('8');
    await authority.query(`INSERT INTO public.enterprise_evidence_candidates(
      id,source_id,source_version_id,org_id,workspace_id,field_key,value,safe_excerpt,
      excerpt_hash,provenance_hash,version,source_locator,confidence,suggestion_status,created_by
    ) VALUES($1,$2,$3,$4,$5,'process_objective','Initial governed value','Initial governed value',$6,$6,1,'line:1-1',0.9,'suggested',$7)`,
    [candidate, source.sourceId, source.sourceVersionId, fixture.org, fixture.workspace, initialHash, fixture.requester]);
    const reviewerVersion = Number((await authority.query(
      'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',
      [fixture.org, fixture.reviewer],
    )).rows[0].version);
    const approverVersion = Number((await authority.query(
      'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',
      [fixture.org, fixture.approver],
    )).rows[0].version);
    const recordReview = async (eventId, key, seed) => {
      const token = fixture.uuid(seed);
      const receipt = (await authority.query(
        "SELECT (public.enterprise_ai_claim_command($1,$2,$3,'approval.review.record',$4,$5,$6,'evidence_candidate',$7)).*",
        [fixture.reviewer, fixture.org, fixture.workspace, key, fixture.uuid(seed + 1), fixture.hash(String(seed % 10)), token],
      )).rows[0];
      const result = (await authority.query(
        'SELECT public.enterprise_record_high_impact_review_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) result',
        [eventId, 'evidence_candidate', candidate, fixture.reviewer, fixture.org, fixture.workspace,
          reviewerVersion, 'Independent current-state review', receipt.id, token, receipt.execution_fence],
      )).rows[0].result;
      await authority.query('SELECT public.enterprise_ai_reload_command($1,$2,$3)', [receipt.id, fixture.org, fixture.workspace]);
      return result;
    };
    const firstReview = await recordReview(fixture.uuid(731), 'stale-review-001', 732);
    const edited = (await authority.query(
      'SELECT public.enterprise_review_evidence_candidate($1,$2,$3,$4,$5,$6,$7,$8,$9) result',
      [candidate, fixture.org, fixture.workspace, 'Changed governed value', initialHash, 'edited',
        fixture.approver, 'Initial governed value', 'Changed after first review'],
    )).rows[0].result;
    assert.notEqual(edited.provenanceHash, firstReview.resourceHash);
    await assert.rejects(authority.query(
      'SELECT public.enterprise_resolve_high_impact_review_authority($1,$2,$3,$4,$5,$6)',
      ['evidence_candidate', candidate, fixture.approver, fixture.org, fixture.workspace, approverVersion],
    ), /ENTERPRISE_APPROVAL_REVIEW_REQUIRED/);
    const secondReview = await recordReview(fixture.uuid(734), 'stale-review-002', 735);
    const resolved = (await authority.query(
      'SELECT public.enterprise_resolve_high_impact_review_authority($1,$2,$3,$4,$5,$6) authority',
      ['evidence_candidate', candidate, fixture.approver, fixture.org, fixture.workspace, approverVersion],
    )).rows[0].authority;
    assert.deepEqual(
      [resolved.reviewEventId, resolved.resourceVersion, resolved.resourceHash],
      [secondReview.reviewEventId, secondReview.resourceVersion, secondReview.resourceHash],
    );
    assert.notEqual(firstReview.resourceHash, secondReview.resourceHash);
  });
  await scenario('candidate lineage, stale edit rejection, and edited Assess draft promotion', async () => {
    const initial = (await authority.query('SELECT value,version,provenance_hash FROM public.enterprise_evidence_candidates WHERE id=$1', [fixture.candidate])).rows[0];
    const edited = (await authority.query('SELECT public.enterprise_review_evidence_candidate($1,$2,$3,$4,$5,$6,$7,$8,$9) result', [fixture.candidate, fixture.org, fixture.workspace, 'Govern the reviewed fixture process', fixture.hash('e'), 'edited', fixture.reviewer, initial.value, 'Corrected against source'])).rows[0].result;
    assert.equal(Number(edited.version), 2);
    assert.notEqual(edited.provenanceHash, initial.provenance_hash);
    await assert.rejects(authority.query('SELECT public.enterprise_review_evidence_candidate($1,$2,$3,$4,$5,$6,$7,$8,$9)', [fixture.candidate, fixture.org, fixture.workspace, 'stale', fixture.hash('e'), 'edited', fixture.reviewer, initial.value, 'stale']), /ENTERPRISE_EVIDENCE_VERSION_CONFLICT/);
    const editHistory = (await authority.query('SELECT actor_id,next_value,resulting_version,resulting_provenance_hash FROM public.enterprise_evidence_candidate_edits WHERE candidate_id=$1', [fixture.candidate])).rows;
    assert.equal(editHistory.length, 1);
    assert.deepEqual([editHistory[0].actor_id, editHistory[0].next_value, Number(editHistory[0].resulting_version), editHistory[0].resulting_provenance_hash], [fixture.reviewer, 'Govern the reviewed fixture process', 2, edited.provenanceHash]);
    await authority.query("UPDATE public.assess_v2_cases SET status='draft' WHERE id=$1", [fixture.caseId]);
    const authorizationVersion = Number((await authority.query('SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [fixture.org, fixture.requester])).rows[0].version);
    const request = fixture.uuid(330);
    const promoted = (await authority.query('SELECT public.enterprise_promote_evidence_to_assess_v2($1,$2,$3,$4,$5,$6,$7,$8,$9) result', [fixture.candidate, fixture.caseId, 2, fixture.requester, fixture.org, fixture.workspace, request, 'fixture-promotion-001', authorizationVersion])).rows[0].result;
    assert.equal(promoted.outcome, 'committed');
    assert.equal(Number(promoted.resource.caseVersion), 3);
    assert.equal((await authority.query('SELECT suggestion_status FROM public.enterprise_evidence_candidates WHERE id=$1', [fixture.candidate])).rows[0].suggestion_status, 'edited');
    const replay = (await authority.query('SELECT public.enterprise_promote_evidence_to_assess_v2($1,$2,$3,$4,$5,$6,$7,$8,$9) result', [fixture.candidate, fixture.caseId, 2, fixture.requester, fixture.org, fixture.workspace, request, 'fixture-promotion-001', authorizationVersion])).rows[0].result;
    assert.equal(replay.outcome, 'replayed');
    await assert.rejects(authority.query('UPDATE public.enterprise_evidence_assess_promotions SET field_key=$1 WHERE candidate_id=$2', ['outcome', fixture.candidate]), /ENTERPRISE_APPEND_ONLY/);
  });
  await scenario('Delivery derives IDs/hashes, enforces three-person approval, and gates Monitor', async () => {
    const handoff = fixture.uuid(340); const workPackage = fixture.uuid(341); const version = fixture.uuid(342);
    const rootLogical = fixture.uuid(343); const childLogical = fixture.uuid(344);
    const result = (await authority.query('SELECT public.enterprise_commit_delivery_handoff($1::jsonb,$2::jsonb,$3::jsonb,$4::jsonb) result', [
      JSON.stringify({id: handoff, org_id: fixture.org, workspace_id: fixture.workspace, studio_document_id: fixture.artifactId, studio_version_id: fixture.version.id, studio_version: Number(fixture.version.version), studio_content_hash: fixture.version.content_hash, created_by: fixture.requester}),
      JSON.stringify({id: workPackage, created_by: fixture.requester}),
      JSON.stringify({id: version, content: {title: 'Canonical delivery'}, content_hash: fixture.hash('f'), created_by: fixture.requester}),
      JSON.stringify([
        {id: rootLogical, itemType: 'Epic', title: 'Root', description: '', acceptanceCriteria: ['reviewed'], nonFunctionalRequirements: [], sourceSectionLocator: 'sections[0]', idempotencyKey: 'delivery-root-001', createdBy: fixture.requester},
        {id: childLogical, parentId: rootLogical, itemType: 'Task', title: 'Child', description: '', acceptanceCriteria: ['verified'], nonFunctionalRequirements: [], sourceSectionLocator: 'sections[0]', idempotencyKey: 'delivery-child-001', createdBy: fixture.requester},
      ]),
    ])).rows[0].result;
    assert.notEqual(result.contentHash, fixture.hash('f'));
    assert.equal(result.itemIds.length, 2);
    const child = (await authority.query("SELECT parent_item_id FROM public.enterprise_delivery_work_items WHERE package_version_id=$1 AND title='Child'", [version])).rows[0];
    assert.equal(child.parent_item_id, result.itemIds[0]);
    const reviewerVersion = Number((await authority.query('SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [fixture.org, fixture.reviewer])).rows[0].version);
    const approverVersion = Number((await authority.query('SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [fixture.org, fixture.approver])).rows[0].version);
    const reviewEvent = fixture.uuid(345);
    const reviewToken = fixture.uuid(720);
    const reviewHash = fixture.hash('6');
    const reviewReceipt = (await authority.query(
      "SELECT (public.enterprise_ai_claim_command($1,$2,$3,'approval.review.record',$4,$5,$6,'delivery_work_package',$7)).*",
      [fixture.reviewer, fixture.org, fixture.workspace, 'canonical-review-001', fixture.uuid(721), reviewHash, reviewToken],
    )).rows[0];
    const canonicalReview = (await authority.query(
      'SELECT public.enterprise_record_high_impact_review_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) result',
      [reviewEvent, 'delivery_work_package', workPackage, fixture.reviewer, fixture.org, fixture.workspace,
        reviewerVersion, 'Independent fixture review', reviewReceipt.id, reviewToken, reviewReceipt.execution_fence],
    )).rows[0].result;
    const packageSnapshot = (await authority.query(
      "SELECT * FROM public.enterprise_resource_snapshot('delivery_work_package',$1,$2,$3)",
      [workPackage, fixture.org, fixture.workspace],
    )).rows[0];
    assert.deepEqual(
      [canonicalReview.resourceId, Number(canonicalReview.resourceVersion), canonicalReview.resourceHash],
      [workPackage, Number(packageSnapshot.resource_version), packageSnapshot.resource_hash],
    );
    const recoveredReview = (await authority.query(
      'SELECT (public.enterprise_ai_reload_command($1,$2,$3)).*',
      [reviewReceipt.id, fixture.org, fixture.workspace],
    )).rows[0];
    assert.equal(recoveredReview.status, 'committed');
    assert.equal(recoveredReview.resource_id, workPackage);
    assert.deepEqual(recoveredReview.response, canonicalReview);
    const reviewEffect = (await authority.query(
      "SELECT resource_id,safe_result FROM public.enterprise_ai_effect_journal WHERE receipt_id=$1 AND effect_key='command'",
      [reviewReceipt.id],
    )).rows[0];
    assert.equal(reviewEffect.resource_id, workPackage);
    assert.equal(reviewEffect.safe_result.resourceId, workPackage);
    assert.deepEqual(
      [recoveredReview.resource_id, reviewEffect.resource_id, recoveredReview.response.resourceId, canonicalReview.resourceId],
      [workPackage, workPackage, workPackage, workPackage],
    );

    const resolved = (await authority.query(
      'SELECT public.enterprise_resolve_high_impact_review_authority($1,$2,$3,$4,$5,$6) authority',
      ['delivery_work_package', workPackage, fixture.approver, fixture.org, fixture.workspace, approverVersion],
    )).rows[0].authority;
    assert.deepEqual(
      [resolved.reviewEventId, resolved.resourceVersion, resolved.resourceHash],
      [reviewEvent, canonicalReview.resourceVersion, canonicalReview.resourceHash],
    );
    const approvalToken = fixture.uuid(722);
    const approvalHash = fixture.hash('7');
    const approvalReceipt = (await authority.query(
      "SELECT (public.enterprise_ai_claim_command($1,$2,$3,'approval.record',$4,$5,$6,'delivery_work_package',$7)).*",
      [fixture.approver, fixture.org, fixture.workspace, 'canonical-approval-001', fixture.uuid(723), approvalHash, approvalToken],
    )).rows[0];
    const canonicalApproval = (await authority.query(
      'SELECT public.enterprise_commit_high_impact_approval_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) result',
      ['delivery_work_package', workPackage, fixture.approver, fixture.org, fixture.workspace,
        approverVersion, reviewEvent, 'approved', 'Independent approval', approvalReceipt.id,
        approvalToken, approvalReceipt.execution_fence],
    )).rows[0].result;
    assert.deepEqual(
      [canonicalApproval.resourceId, canonicalApproval.reviewEventId, canonicalApproval.resourceHash],
      [workPackage, reviewEvent, canonicalReview.resourceHash],
    );
    const recoveredApproval = (await authority.query(
      'SELECT (public.enterprise_ai_reload_command($1,$2,$3)).*',
      [approvalReceipt.id, fixture.org, fixture.workspace],
    )).rows[0];
    assert.equal(recoveredApproval.status, 'committed');
    assert.deepEqual(recoveredApproval.response, canonicalApproval);
    const beforeReplay = (await authority.query(`SELECT
      (SELECT count(*)::int FROM public.enterprise_high_impact_review_events WHERE resource_id=$1) reviews,
      (SELECT count(*)::int FROM public.enterprise_high_impact_approvals WHERE resource_id=$1) approvals,
      (SELECT count(*)::int FROM public.enterprise_ai_effect_journal WHERE receipt_id=ANY($2::uuid[])) effects`,
    [workPackage, [reviewReceipt.id, approvalReceipt.id]])).rows[0];
    const exactReviewReplay = (await authority.query(
      "SELECT (public.enterprise_ai_claim_command($1,$2,$3,'approval.review.record',$4,$5,$6,'delivery_work_package',$7)).*",
      [fixture.reviewer, fixture.org, fixture.workspace, 'canonical-review-001', fixture.uuid(724), reviewHash, fixture.uuid(725)],
    )).rows[0];
    const exactApprovalReplay = (await authority.query(
      "SELECT (public.enterprise_ai_claim_command($1,$2,$3,'approval.record',$4,$5,$6,'delivery_work_package',$7)).*",
      [fixture.approver, fixture.org, fixture.workspace, 'canonical-approval-001', fixture.uuid(726), approvalHash, fixture.uuid(727)],
    )).rows[0];
    assert.deepEqual([exactReviewReplay.status, exactApprovalReplay.status], ['committed', 'committed']);
    const afterReplay = (await authority.query(`SELECT
      (SELECT count(*)::int FROM public.enterprise_high_impact_review_events WHERE resource_id=$1) reviews,
      (SELECT count(*)::int FROM public.enterprise_high_impact_approvals WHERE resource_id=$1) approvals,
      (SELECT count(*)::int FROM public.enterprise_ai_effect_journal WHERE receipt_id=ANY($2::uuid[])) effects`,
    [workPackage, [reviewReceipt.id, approvalReceipt.id]])).rows[0];
    assert.deepEqual(afterReplay, beforeReplay);
    const claimedReceipts = Number((await authority.query(
      "SELECT count(*)::int n FROM public.enterprise_ai_command_receipts WHERE id=ANY($1::uuid[]) AND status='claimed'",
      [[reviewReceipt.id, approvalReceipt.id]],
    )).rows[0].n);
    assert.equal(claimedReceipts, 0);
    console.log(`CANONICAL APPROVAL COUNTS ${JSON.stringify({
      reviewReceiptResourceId:recoveredReview.resource_id, reviewEffectResourceId:reviewEffect.resource_id,
      reviewResponseResourceId:recoveredReview.response.resourceId,
      reviewResourceHash:canonicalReview.resourceHash, reviewResourceVersion:canonicalReview.resourceVersion,
      approvalResourceHash:canonicalApproval.resourceHash, approvalResourceVersion:canonicalApproval.resourceVersion,
      duplicateReviews:0, duplicateApprovals:0, duplicateEffects:0, replayAdditionalWrites:0, claimedReceipts,
    })}`);
    const baselineId = fixture.uuid(346);
    const monitor = (await authority.query('SELECT public.enterprise_commit_monitor_baseline($1::jsonb,$2,$3,$4) result', [JSON.stringify({id: baselineId, workPackageVersionId: version, approvedItemIds: result.itemIds, milestones: [], dependencies: [], blockers: [], risks: []}), fixture.requester, fixture.org, fixture.workspace])).rows[0].result;
    assert.deepEqual([monitor.status, monitor.readiness], ['approval_required', 'review_required']);
    const persisted = (await authority.query('SELECT live_telemetry_connected,resource_hash FROM public.enterprise_monitor_baselines WHERE id=$1', [baselineId])).rows[0];
    assert.equal(persisted.live_telemetry_connected, false);
    assert.equal(persisted.resource_hash, monitor.resourceHash);
    await assert.rejects(authority.query("UPDATE public.enterprise_delivery_work_items SET title='mutated' WHERE package_version_id=$1", [version]), /ENTERPRISE_APPEND_ONLY/);
  });
  await scenario('Modernization ancestry derives a governed decision and Assemble remains draft-only until approval', async () => {
    const application = fixture.uuid(360); const metadata = fixture.uuid(361); const sourceAssessment = fixture.uuid(362);
    await authority.query(`INSERT INTO public.assess_application_assets(id,org_id,workspace_id,name,normalized_name,created_by)
      VALUES($1,$2,$3,'Fixture application','fixture application',$4)`, [application, fixture.org, fixture.workspace, fixture.requester]);
    await authority.query(`INSERT INTO public.assess_application_metadata_versions(id,org_id,workspace_id,application_id,version,lifecycle,metadata,author_id)
      VALUES($1,$2,$3,$4,1,'approved','{}'::jsonb,$5)`, [metadata, fixture.org, fixture.workspace, application, fixture.requester]);
    const authorizationVersion = Number((await authority.query('SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [fixture.org, fixture.requester])).rows[0].version);
    await authority.query(`INSERT INTO public.assess_application_assessment_versions(
      id,org_id,workspace_id,application_id,metadata_version_id,version,decision_model_version,lifecycle,author_id,authorization_version)
      VALUES($1,$2,$3,$4,$5,1,'assess-v2-application-portfolio-2026-07','approved',$6,$7)`,
    [sourceAssessment, fixture.org, fixture.workspace, application, metadata, fixture.requester, authorizationVersion]);
    const dimensions = [
      'integration_accessibility', 'semantic_and_data_clarity', 'state_and_execution',
      'security_and_control', 'architecture_changeability', 'ui_automation_readiness',
      'ai_assisted_engineering_readiness',
    ];
    await authority.query(`INSERT INTO public.assess_application_dimension_results(
      org_id,workspace_id,application_id,metadata_version_id,assessment_version_id,dimension,
      readiness_band,evidence_confidence,hard_gates,evidence_refs,missing_evidence,rationale,
      contradictions,remediation_requirements,what_would_change)
      SELECT $1,$2,$3,$4,$5,dimension,'Ready','Verified','{}'::text[],'[]'::jsonb,
        '{}'::text[],ARRAY['verified'],'{}'::text[],'{}'::text[],ARRAY['new evidence']
      FROM unnest($6::text[]) dimension`, [fixture.org, fixture.workspace, application, metadata, sourceAssessment, dimensions]);
    await authority.query(`INSERT INTO public.assess_application_modernization_recommendations(
      org_id,workspace_id,application_id,metadata_version_id,assessment_version_id,disposition,
      migration_boundary,rollback_strategy,evidence_confidence)
      VALUES($1,$2,$3,$4,$5,'assemble','draft-only boundary','retain current system','Verified')`,
    [fixture.org, fixture.workspace, application, metadata, sourceAssessment]);
    const enterpriseAssessment = fixture.uuid(363); const decision = fixture.uuid(364);
    const committed = (await authority.query('SELECT public.enterprise_commit_modernization_assessment($1::jsonb,$2::jsonb) result', [
      JSON.stringify({id: enterpriseAssessment, org_id: fixture.org, workspace_id: fixture.workspace, application_ref: application, source_assessment_id: sourceAssessment, source_metadata_version_id: metadata, created_by: fixture.requester}),
      JSON.stringify({id: decision, created_by: fixture.requester}),
    ])).rows[0].result;
    assert.equal(committed.primaryDisposition, 'assemble');
    assert.match(committed.resourceHash, /^[0-9a-f]{64}$/);
    const reviewerVersion = Number((await authority.query('SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [fixture.org, fixture.reviewer])).rows[0].version);
    const decisionReview = fixture.uuid(365);
    await authority.query(`INSERT INTO public.enterprise_high_impact_review_events(id,org_id,workspace_id,resource_type,resource_id,reviewer_id,reviewer_authorization_version,resource_version,resource_hash,outcome,rationale)
      VALUES($1,$2,$3,'modernization_decision',$4,$5,$6,1,$7,'approved','Independent modernization review')`,
    [decisionReview, fixture.org, fixture.workspace, decision, fixture.reviewer, reviewerVersion, fixture.hash('0')]);
    await authority.query('SELECT public.enterprise_commit_high_impact_approval($1::jsonb,$2,$3,$4,$5,$6)', [JSON.stringify({created_by: fixture.requester, reviewed_by: fixture.reviewer, approved_by: fixture.approver, review_event_id: decisionReview, outcome: 'approved', rationale: 'Modernization approval'}), 'modernization_decision', decision, fixture.org, fixture.workspace, 'approved']);
    const blueprint = fixture.uuid(366);
    const assembled = (await authority.query('SELECT public.enterprise_commit_assemble_blueprint($1::jsonb,$2,$3,$4) result', [JSON.stringify({id: blueprint, modernizationDecisionId: decision, structuredContent: {components: []}, readableDocument: 'Draft-only fixture blueprint'}), fixture.requester, fixture.org, fixture.workspace])).rows[0].result;
    assert.deepEqual([assembled.status, assembled.executionEnabled, assembled.runtimeAgentsEnabled, assembled.liveTelemetryEnabled], ['draft', false, false, false]);
    const flags = (await authority.query(`SELECT code_generation_enabled,deployment_enabled,infrastructure_changes_enabled,
      credential_access_enabled,source_system_calls_enabled,runtime_agents_enabled,live_telemetry_enabled
      FROM public.enterprise_assemble_blueprints WHERE id=$1`, [blueprint])).rows[0];
    assert.deepEqual(Object.values(flags), [false, false, false, false, false, false, false]);
    const blueprintReview = fixture.uuid(367);
    await authority.query(`INSERT INTO public.enterprise_high_impact_review_events(id,org_id,workspace_id,resource_type,resource_id,reviewer_id,reviewer_authorization_version,resource_version,resource_hash,outcome,rationale)
      VALUES($1,$2,$3,'assemble_blueprint',$4,$5,$6,1,$7,'approved','Independent blueprint review')`,
    [blueprintReview, fixture.org, fixture.workspace, blueprint, fixture.reviewer, reviewerVersion, fixture.hash('0')]);
    await authority.query('SELECT public.enterprise_commit_high_impact_approval($1::jsonb,$2,$3,$4,$5,$6)', [JSON.stringify({created_by: fixture.requester, reviewed_by: fixture.reviewer, approved_by: fixture.approver, review_event_id: blueprintReview, outcome: 'approved', rationale: 'Blueprint approval'}), 'assemble_blueprint', blueprint, fixture.org, fixture.workspace, 'approved']);
    await assert.rejects(authority.query("UPDATE public.enterprise_assemble_blueprints SET status='rejected' WHERE id=$1", [blueprint]), /ENTERPRISE_RESOURCE_IMMUTABLE_OR_TRANSITION_INVALID/);
  });
  await scenario('read-only rollback blocks mutations while capability projection remains available', async () => {
    await authority.query('UPDATE public.enterprise_intelligence_runtime_control SET read_only=true WHERE singleton=true');
    await assert.rejects(authority.query('SELECT public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,$8)', [fixture.requester, fixture.org, fixture.workspace, 'evidence.source.create', 'fixture-readonly-001', fixture.uuid(350), fixture.hash('a'), null]), /ENTERPRISE_INTELLIGENCE_READ_ONLY/);
    await authority.query('BEGIN');
    try {
      await authority.query('SET LOCAL ROLE authenticated');
      await authority.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [fixture.requester]);
      const projection = (await authority.query('SELECT public.enterprise_evidence_source_projection($1,$2,$3) projection', [fixture.org, fixture.workspace, fixture.sources[0].sourceId])).rows[0].projection;
      assert.ok(projection);
      assert.equal(Object.hasOwn(projection, 'storagePath'), false);
      await assert.rejects(authority.query("INSERT INTO public.enterprise_evidence_questions(source_id,org_id,workspace_id,question,status,created_by) VALUES($1,$2,$3,'forbidden','open',$4)", [fixture.sources[0].sourceId, fixture.org, fixture.workspace, fixture.requester]), /permission denied/);
    } finally { await authority.query('ROLLBACK'); }
    await authority.query('UPDATE public.enterprise_intelligence_runtime_control SET read_only=false WHERE singleton=true');
  });

  console.log(`Enterprise Intelligence PostgreSQL executable scenarios: ${scenarios.length} passed, 0 failed.`);
} finally {
  for (const client of clients.reverse()) if (client !== admin) await client.end().catch(() => {});
  if (admin) {
    let cleanupFailed = false;
    for (const name of createdDatabases.reverse()) {
      try { await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); console.log(`CLEANUP DROPPED DATABASE ${name}`); }
      catch (error) { cleanupFailed = true; console.error(`CLEANUP FAILED DATABASE ${name}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    for (const role of createdRoles.reverse()) {
      try { await admin.query(`DROP ROLE IF EXISTS ${role}`); }
      catch (error) { cleanupFailed = true; console.error(`CLEANUP FAILED ROLE ${role}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    await admin.end().catch(() => {});
    console.log(`CLEANUP ${cleanupFailed ? 'FAILED' : 'PASS'}`);
    if (cleanupFailed) process.exitCode = 1;
  }
}

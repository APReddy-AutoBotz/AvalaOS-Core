import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

execFileSync(process.execPath, ['scripts/checkPr1gMigrationContract.mjs'], { stdio: 'inherit' });

const url = process.env.DATABASE_URL;
if (!url) {
  if (process.env.CI) {
    console.error('DATABASE_URL is required for PR 1G PostgreSQL 16 CI execution.');
    process.exit(1);
  }
  console.log('DATABASE_URL not set; PR 1G PostgreSQL 16 execution not run locally. Static contract check only.');
  process.exit(0);
}

const pg = await import('pg');
const client = new pg.Client({ connectionString: url });
await client.connect();

const executed = [];
const scenario = async (name, fn) => {
  const result = await fn();
  executed.push(name);
  return result;
};
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const expectSqlFailure = async (name, expected, fn) => scenario(name, async () => {
  try {
    await fn();
    throw new Error(`${name}: expected SQL failure containing ${expected}`);
  } catch (error) {
    if (!String(error.message).includes(expected)) throw error;
  }
});

let uuidSequence = 1;
const nextUuid = () => `00000000-0000-4000-8000-${String(uuidSequence++).padStart(12, '0')}`;
const ORG = '22222222-2222-4222-8222-222222222222';
const WS = '33333333-3333-4333-8333-333333333333';
const ACTOR = '44444444-4444-4444-8444-444444444444';
const REVIEWER_A = '44444444-4444-4444-8444-444444444445';
const REVIEWER_B = '44444444-4444-4444-8444-444444444446';
const OTHER_ORG = '22222222-2222-4222-8222-222222222223';
const OTHER_WS = '33333333-3333-4333-8333-333333333334';
const OTHER_APP = '55555555-5555-4555-8555-555555555556';
const AUTH_VERSION = 7;
const canonicalDimensions = [
  'integration_accessibility',
  'semantic_and_data_clarity',
  'state_and_execution',
  'security_and_control',
  'architecture_changeability',
  'ui_automation_readiness',
  'ai_assisted_engineering_readiness',
];

const canonicalMetadata = (name, overrides = {}) => ({
  name,
  businessCapabilities: [],
  supportedProcesses: [],
  businessCriticality: 'Unknown',
  lifecycleState: 'Unknown',
  sourceCode: 'Unknown',
  documentationQuality: 'Unknown',
  automatedTestMaturity: 'Unknown',
  deploymentRepeatability: 'Unknown',
  observability: 'Unknown',
  dataClassifications: [],
  regulatedData: 'Unknown',
  operatingRegions: [],
  interfaces: [],
  upstreamDependencies: [],
  downstreamDependencies: [],
  realTime: 'Unknown',
  eventDriven: 'Unknown',
  synchronous: 'Unknown',
  batch: 'Unknown',
  synthetic: false,
  ...overrides,
});
const evidenceFor = (sourceType = 'test', synthetic = false) => canonicalDimensions.map((claim, index) => ({
  id: `${sourceType}-${index}-${nextUuid()}`,
  claimIds: [claim],
  sourceType,
  fresh: true,
  independent: true,
  accepted: true,
  contradicts: false,
  synthetic,
}));

const rpc = async (connection, {
  actor = ACTOR,
  type,
  expected = 0,
  key = `idem-${nextUuid()}`,
  payload,
  requestId = nextUuid(),
  org = ORG,
  workspace = WS,
}) => {
  const result = await connection.query(
    `SELECT public.pr1g_execute_application_command(
      $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::text,$9::jsonb
    ) AS result`,
    [org, workspace, actor, requestId, type, expected, AUTH_VERSION, key, JSON.stringify(payload)],
  );
  return result.rows[0].result;
};
const createApplication = async (name, id = nextUuid()) => {
  const result = await rpc(client, {
    type: 'application.create',
    payload: { applicationId: id, name, description: `${name} application` },
  });
  assert(result.resource.id === id && result.resource.status === 'draft', `CREATE_FAILED_${name}`);
  return id;
};
const createMetadata = async (applicationId, metadata, evidence = [], id = nextUuid()) => {
  const result = await rpc(client, {
    type: 'application.metadata.upsert',
    payload: { applicationId, metadataVersionId: id, metadataVersion: 1, metadata, evidence },
  });
  assert(result.resource.id === id && result.resource.version === 1, `METADATA_FAILED_${metadata.name}`);
  return id;
};
const saveAssessment = async (applicationId, assessmentVersionId, extra = {}, expected = 0, version = 1) => rpc(client, {
  type: 'application.assessment.save',
  expected,
  payload: {
    assessmentVersionId,
    applicationId,
    metadataVersion: 1,
    assessmentVersion: version,
    processLinks: [],
    dependencies: [],
    ...extra,
  },
});
const finalizeAssessment = async (applicationId, assessmentVersionId, expected, metadataVersion = 1, key) => rpc(client, {
  type: 'application.assessment.finalize',
  expected,
  key,
  payload: { assessmentVersionId, applicationId, metadataVersion, rationale: 'Ready for independent review' },
});
const resolveReview = async (connection, actor, applicationId, assessmentVersionId, expected, key, resolution = 'changes_requested') => rpc(connection, {
  actor,
  type: 'application.assessment.review.resolve',
  expected,
  key,
  payload: {
    assessmentVersionId,
    applicationId,
    metadataVersion: 1,
    resolution,
    rationale: 'Independent evidence review',
    conditions: resolution === 'changes_requested' ? ['Add evidence'] : [],
  },
});
const startRevision = async (connection, applicationId, assessmentVersionId, expected, key, rationale = 'Revise after review') => rpc(connection, {
  type: 'application.assessment.revision.start',
  expected,
  key,
  payload: { assessmentVersionId, applicationId, metadataVersion: 1, rationale },
});
const createSnapshot = async (expected, id = nextUuid(), key) => rpc(client, {
  type: 'application.portfolio.snapshot.create',
  expected,
  key,
  payload: { portfolioSnapshotId: id },
});

try {
  await scenario('PostgreSQL 16 version', async () => {
    const version = await client.query('SHOW server_version_num');
    assert(Number(version.rows[0].server_version_num) >= 160000, 'POSTGRESQL_16_REQUIRED');
  });

  await scenario('disposable database schema recreation', async () => {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
    await client.query('GRANT ALL ON SCHEMA public TO postgres');
    await client.query('GRANT USAGE ON SCHEMA public TO PUBLIC');
  });
  await scenario('prerequisite schema and role setup', async () => {
    await client.query("DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$");
    await client.query("DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$");
    await client.query("DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$");
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public');
    await client.query('CREATE SCHEMA IF NOT EXISTS auth');
    await client.query(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '${ACTOR}'::uuid $$`);
    await client.query('CREATE TABLE public.profiles(id uuid PRIMARY KEY)');
    await client.query('CREATE TABLE public.organizations(id uuid PRIMARY KEY, deleted_at timestamptz)');
    await client.query('CREATE TABLE public.workspaces(id uuid NOT NULL, org_id uuid NOT NULL, deleted_at timestamptz, PRIMARY KEY(id,org_id))');
    await client.query('CREATE TABLE public.capabilities(capability_key text PRIMARY KEY,module text NOT NULL,description text NOT NULL)');
    await client.query('CREATE TABLE public.authorization_versions(org_id uuid NOT NULL,user_id uuid NOT NULL,version bigint NOT NULL DEFAULT 1,PRIMARY KEY(org_id,user_id))');
    await client.query("CREATE TABLE public.assess_command_receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,workspace_id uuid NOT NULL,actor_id uuid NOT NULL,command_type text NOT NULL,idempotency_key text NOT NULL,request_id uuid NOT NULL,request_hash text NOT NULL,status text NOT NULL,response jsonb,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,UNIQUE(org_id,actor_id,command_type,idempotency_key))");
    await client.query("CREATE TABLE public.privileged_audit_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,workspace_id uuid NOT NULL,actor_id uuid NOT NULL,request_id uuid NOT NULL,action text NOT NULL,resource_type text NOT NULL,resource_id uuid NOT NULL,outcome text NOT NULL,resource_version bigint,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now())");
    await client.query('CREATE TABLE public.workspace_capability_grants(org_id uuid NOT NULL,workspace_id uuid NOT NULL,capability_key text NOT NULL,PRIMARY KEY(org_id,workspace_id,capability_key))');
    await client.query("CREATE OR REPLACE FUNCTION public.has_workspace_capability(p_workspace_id uuid,p_org_id uuid,p_capability_key text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM public.workspaces w JOIN public.organizations o ON o.id=w.org_id JOIN public.workspace_capability_grants g ON g.org_id=w.org_id AND g.workspace_id=w.id AND g.capability_key=p_capability_key WHERE w.id=p_workspace_id AND w.org_id=p_org_id AND w.deleted_at IS NULL AND o.deleted_at IS NULL) $$");
    await client.query("CREATE OR REPLACE FUNCTION public.pr1b_claim_command(p_actor uuid,p_org uuid,p_workspace uuid,p_type text,p_key text,p_request uuid,p_hash text) RETURNS public.assess_command_receipts LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE v_row public.assess_command_receipts; BEGIN INSERT INTO public.assess_command_receipts(org_id,workspace_id,actor_id,command_type,idempotency_key,request_id,request_hash,status) VALUES(p_org,p_workspace,p_actor,p_type,p_key,p_request,p_hash,'in_progress') ON CONFLICT(org_id,actor_id,command_type,idempotency_key) DO NOTHING RETURNING * INTO v_row; IF v_row.id IS NULL THEN SELECT * INTO v_row FROM public.assess_command_receipts WHERE org_id=p_org AND actor_id=p_actor AND command_type=p_type AND idempotency_key=p_key FOR UPDATE; IF v_row.request_hash<>p_hash THEN RAISE EXCEPTION 'PR1G_IDEMPOTENCY_CONFLICT'; END IF; END IF; RETURN v_row; END $$");
  });

  const sql = await readFile('supabase/migrations/20260722120000_pr1g_application_portfolio.sql', 'utf8');
  await scenario('fresh migration', async () => client.query(sql));
  await scenario('accepted PR1F schema fixture compatibility', async () => {
    await client.query('CREATE TABLE public.assess_v2_review_resolutions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,workspace_id uuid NOT NULL,resolution text NOT NULL)');
    await client.query('CREATE TABLE public.assess_v2_economics_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,workspace_id uuid NOT NULL,status text NOT NULL,currency char(3))');
    await client.query('INSERT INTO public.assess_v2_review_resolutions(org_id,workspace_id,resolution) VALUES($1,$2,$3)', [ORG, WS, 'approved']);
    await client.query("INSERT INTO public.assess_v2_economics_versions(org_id,workspace_id,status,currency) VALUES($1,$2,'approved','USD')", [ORG, WS]);
    const result = await client.query('SELECT (SELECT count(*)::int FROM public.assess_v2_review_resolutions) reviews,(SELECT count(*)::int FROM public.assess_v2_economics_versions) economics');
    assert(result.rows[0].reviews === 1 && result.rows[0].economics === 1, 'PR1F_FIXTURE_COMPATIBILITY_FAILED');
  });
  await scenario('capabilities schema', async () => {
    const result = await client.query("SELECT count(*)::int n FROM public.capabilities WHERE capability_key LIKE 'assess.applications.%'");
    assert(result.rows[0].n === 6, 'CAPABILITY_SCHEMA_FAILED');
  });
  await scenario('RPC privilege boundaries', async () => {
    const result = await client.query(`SELECT
      has_function_privilege('public','public.pr1g_execute_application_command(uuid,uuid,uuid,uuid,text,bigint,bigint,text,jsonb)','EXECUTE') public_execute,
      has_function_privilege('anon','public.pr1g_execute_application_command(uuid,uuid,uuid,uuid,text,bigint,bigint,text,jsonb)','EXECUTE') anon_execute,
      has_function_privilege('authenticated','public.pr1g_execute_application_command(uuid,uuid,uuid,uuid,text,bigint,bigint,text,jsonb)','EXECUTE') authenticated_execute,
      has_function_privilege('service_role','public.pr1g_execute_application_command(uuid,uuid,uuid,uuid,text,bigint,bigint,text,jsonb)','EXECUTE') service_execute,
      has_function_privilege('authenticated','public.pr1g_read_application_portfolio_projection(uuid,uuid)','EXECUTE') authenticated_read`);
    const row = result.rows[0];
    assert(!row.public_execute && !row.anon_execute && !row.authenticated_execute && row.service_execute && row.authenticated_read, 'RPC_PRIVILEGE_BOUNDARY_FAILED');
  });
  await scenario('forced RLS on every PR 1G tenant table', async () => {
    const result = await client.query("SELECT count(*)::int n FROM pg_class WHERE relname LIKE 'assess_application_%' AND relforcerowsecurity");
    assert(result.rows[0].n === 11, 'RLS_NOT_FORCED_ON_ALL_TABLES');
  });

  await scenario('tenant and actor authority fixtures', async () => {
    await client.query('INSERT INTO public.profiles(id) VALUES($1),($2),($3)', [ACTOR, REVIEWER_A, REVIEWER_B]);
    await client.query('INSERT INTO public.organizations(id) VALUES($1),($2)', [ORG, OTHER_ORG]);
    await client.query('INSERT INTO public.workspaces(id,org_id) VALUES($1,$2),($3,$4)', [WS, ORG, OTHER_WS, OTHER_ORG]);
    await client.query('INSERT INTO public.authorization_versions(org_id,user_id,version) VALUES($1,$2,$4),($1,$3,$4),($1,$5,$4)', [ORG, ACTOR, REVIEWER_A, AUTH_VERSION, REVIEWER_B]);
    await client.query("INSERT INTO public.workspace_capability_grants(org_id,workspace_id,capability_key) SELECT $1,$2,capability_key FROM public.capabilities WHERE capability_key LIKE 'assess.applications.%'", [ORG, WS]);
    await client.query('INSERT INTO public.assess_application_assets(id,org_id,workspace_id,name,normalized_name,description,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)', [OTHER_APP, OTHER_ORG, OTHER_WS, 'Other tenant app', 'other tenant app', 'Tenant B', ACTOR]);
  });

  const gatedApp = await createApplication('Gated UI');
  const gatedMeta = await createMetadata(
    gatedApp,
    canonicalMetadata('Gated UI', { interfaces: ['UI-only'] }),
    evidenceFor(),
  );
  const gatedAssessment = nextUuid();
  await scenario('assessment save derives exactly seven unique canonical dimensions', async () => {
    await saveAssessment(gatedApp, gatedAssessment);
    const result = await client.query(
      'SELECT count(*)::int total,count(DISTINCT dimension)::int unique_count,array_agg(dimension ORDER BY dimension) names FROM public.assess_application_dimension_results WHERE assessment_version_id=$1',
      [gatedAssessment],
    );
    assert(result.rows[0].total === 7 && result.rows[0].unique_count === 7, 'SEVEN_UNIQUE_DIMENSIONS_REQUIRED');
    assert(JSON.stringify(result.rows[0].names) === JSON.stringify([...canonicalDimensions].sort()), 'CANONICAL_DIMENSION_NAMES_MISMATCH');
  });
  await scenario('server-derived recommendation and hard-gate behavior', async () => {
    const result = await client.query(
      `SELECT r.disposition,r.evidence_confidence,r.prerequisites,
        (SELECT hard_gates FROM public.assess_application_dimension_results WHERE assessment_version_id=$1 AND dimension='ui_automation_readiness') ui_gates
       FROM public.assess_application_modernization_recommendations r WHERE r.assessment_version_id=$1`,
      [gatedAssessment],
    );
    assert(result.rowCount === 1, 'SERVER_RECOMMENDATION_REQUIRED');
    assert(result.rows[0].disposition === 'Blocked pending prerequisite', 'HARD_GATE_DISPOSITION_MISMATCH');
    assert(result.rows[0].ui_gates.includes('UI_AUTOMATION_POSITIVE_EVIDENCE_REQUIRED'), 'UI_HARD_GATE_MISSING');
    assert(result.rows[0].prerequisites.includes('UI_AUTOMATION_POSITIVE_EVIDENCE_REQUIRED'), 'RECOMMENDATION_GATE_MISSING');
  });
  await scenario('client-authored authority fields are rejected', async () => {
    for (const field of ['dimensions', 'recommendations', 'confidence', 'bands', 'gates', 'dispositions']) {
      const before = await client.query('SELECT count(*)::int n FROM public.assess_application_assessment_versions');
      try {
        await saveAssessment(gatedApp, nextUuid(), { [field]: [] }, 1, 2);
        throw new Error(`CLIENT_AUTHORED_${field.toUpperCase()}_ACCEPTED`);
      } catch (error) {
        assert(String(error.message).includes('PR1G_INVALID_COMMAND'), `CLIENT_AUTHORED_${field.toUpperCase()}_WRONG_ERROR`);
      }
      const after = await client.query('SELECT count(*)::int n FROM public.assess_application_assessment_versions');
      assert(after.rows[0].n === before.rows[0].n, `CLIENT_AUTHORED_${field.toUpperCase()}_PERSISTED`);
    }
  });

  const syntheticApp = await createApplication('Synthetic evidence');
  const syntheticEvidence = evidenceFor('synthetic_fixture', true);
  const syntheticMeta = await createMetadata(
    syntheticApp,
    canonicalMetadata('Synthetic evidence', { synthetic: true }),
    syntheticEvidence,
  );
  const syntheticAssessment = nextUuid();
  await scenario('durable immutable source evidence and synthetic evidence never verifies', async () => {
    await saveAssessment(syntheticApp, syntheticAssessment);
    const confidence = await client.query('SELECT array_agg(DISTINCT evidence_confidence) confidences FROM public.assess_application_dimension_results WHERE assessment_version_id=$1', [syntheticAssessment]);
    assert(!confidence.rows[0].confidences.includes('Verified'), 'SYNTHETIC_EVIDENCE_VERIFIED');
    await expectSqlFailure('source evidence update immutability', 'PR1G_IMMUTABLE_RECORD', () => client.query('UPDATE public.assess_application_source_evidence SET accepted=false WHERE metadata_version_id=$1', [syntheticMeta]));
    await expectSqlFailure('source evidence delete immutability', 'PR1G_IMMUTABLE_RECORD', () => client.query('DELETE FROM public.assess_application_source_evidence WHERE metadata_version_id=$1', [syntheticMeta]));
    const durable = await client.query('SELECT count(*)::int n FROM public.assess_application_source_evidence WHERE metadata_version_id=$1', [syntheticMeta]);
    assert(durable.rows[0].n === 7, 'SOURCE_EVIDENCE_NOT_DURABLE');
  });

  const malformedRows = [
    { name: '' },
    { ...canonicalMetadata('Unknown property'), unsupportedAuthority: true },
    { ...canonicalMetadata('Wrong array'), interfaces: 'REST/GraphQL' },
    { ...canonicalMetadata('Wrong enum'), sourceCode: 'trusted' },
  ];
  const importReceiptId = nextUuid();
  await scenario('strict malformed import-row rejection', async () => {
    const valid = canonicalMetadata('Imported valid');
    await rpc(client, {
      type: 'application.import',
      payload: { importReceiptId, payloadHash: 'strict-import', rows: [valid, ...malformedRows] },
    });
    const result = await client.query(
      "SELECT count(*) FILTER(WHERE outcome='success')::int successes,count(*) FILTER(WHERE outcome='rejected')::int rejections,count(*) FILTER(WHERE outcome='rejected' AND error_code='INVALID_METADATA')::int invalid FROM public.assess_application_import_row_outcomes WHERE import_receipt_id=$1",
      [importReceiptId],
    );
    assert(result.rows[0].successes === 1 && result.rows[0].rejections === 4 && result.rows[0].invalid === 4, 'STRICT_IMPORT_REJECTION_FAILED');
  });
  await scenario('import receipt counts match persisted row outcomes', async () => {
    const result = await client.query(
      `SELECT r.success_count,r.rejection_count,
        count(*) FILTER(WHERE o.outcome='success')::int persisted_successes,
        count(*) FILTER(WHERE o.outcome='rejected')::int persisted_rejections
       FROM public.assess_application_import_receipts r
       JOIN public.assess_application_import_row_outcomes o ON o.import_receipt_id=r.id
       WHERE r.id=$1 GROUP BY r.id`,
      [importReceiptId],
    );
    const row = result.rows[0];
    assert(row.success_count === row.persisted_successes && row.rejection_count === row.persisted_rejections, 'IMPORT_RECEIPT_COUNTS_MISMATCH');
  });

  await expectSqlFailure('missing dependency rejection', 'violates foreign key constraint', () => saveAssessment(
    syntheticApp,
    nextUuid(),
    { dependencies: [{ upstreamApplicationId: nextUuid(), downstreamApplicationId: syntheticApp, dependencyType: 'runtime' }] },
    1,
    2,
  ));
  await expectSqlFailure('cross-tenant dependency rejection', 'violates foreign key constraint', () => saveAssessment(
    syntheticApp,
    nextUuid(),
    { dependencies: [{ upstreamApplicationId: OTHER_APP, downstreamApplicationId: syntheticApp, dependencyType: 'runtime' }] },
    1,
    2,
  ));

  const readyApp = await createApplication('Verified API');
  const readyMeta = await createMetadata(
    readyApp,
    canonicalMetadata('Verified API', {
      interfaces: ['REST/GraphQL'],
      aiControls: {
        legalSourceRights: true,
        executableAcceptanceTests: true,
        reproducibleBuild: true,
        controlledSecurityReview: true,
        humanEngineeringOwner: true,
        controlledDeploymentRollback: true,
      },
    }),
    evidenceFor(),
  );
  const readyAssessment = nextUuid();
  await saveAssessment(readyApp, readyAssessment);

  const insufficientApp = await createApplication('Insufficient evidence');
  const insufficientMeta = await createMetadata(insufficientApp, canonicalMetadata('Insufficient evidence'), []);
  const insufficientAssessment = nextUuid();
  await saveAssessment(insufficientApp, insufficientAssessment);

  await scenario('multi-node dependency-cycle rejection', async () => {
    await client.query(
      `INSERT INTO public.assess_application_dependencies(org_id,workspace_id,upstream_application_id,downstream_application_id,dependency_type,metadata_version_id,created_by)
       VALUES($1,$2,$3,$4,'runtime',$5,$6),($1,$2,$4,$7,'runtime',$8,$6),($1,$2,$7,$3,'runtime',$9,$6)`,
      [ORG, WS, readyApp, gatedApp, gatedMeta, ACTOR, insufficientApp, insufficientMeta, readyMeta],
    );
    try {
      await createSnapshot(0);
      throw new Error('MULTI_NODE_CYCLE_ACCEPTED');
    } catch (error) {
      assert(String(error.message).includes('PR1G_DEPENDENCY_CYCLE'), 'MULTI_NODE_CYCLE_WRONG_ERROR');
    }
    await client.query('DELETE FROM public.assess_application_dependencies');
  });
  await scenario('mixed-currency snapshot rejection', async () => {
    await client.query(
      `INSERT INTO public.assess_process_application_links(org_id,workspace_id,process_id,primitive_id,application_id,application_metadata_version_id,interaction_type,govern_state,economics_ref,economics_currency,created_by)
       VALUES($1,$2,$3,'p-usd',$4,$5,'read','approved',$6,'USD',$7),($1,$2,$8,'p-eur',$9,$10,'read','approved',$11,'EUR',$7)`,
      [ORG, WS, nextUuid(), readyApp, readyMeta, nextUuid(), ACTOR, nextUuid(), gatedApp, gatedMeta, nextUuid()],
    );
    try {
      await createSnapshot(0);
      throw new Error('MIXED_CURRENCY_SNAPSHOT_ACCEPTED');
    } catch (error) {
      assert(String(error.message).includes('PR1G_INCOMPATIBLE_CURRENCIES'), 'MIXED_CURRENCY_WRONG_ERROR');
    }
    await client.query('DELETE FROM public.assess_process_application_links WHERE economics_ref IS NOT NULL');
  });
  await scenario('deterministic dependency-ordered waves', async () => {
    await client.query(
      `INSERT INTO public.assess_application_dependencies(org_id,workspace_id,upstream_application_id,downstream_application_id,dependency_type,metadata_version_id,created_by)
       VALUES($1,$2,$3,$4,'runtime',$5,$6),($1,$2,$4,$7,'runtime',$8,$6)`,
      [ORG, WS, readyApp, gatedApp, gatedMeta, ACTOR, insufficientApp, insufficientMeta],
    );
    const snapshot = await createSnapshot(0);
    const persisted = await client.query('SELECT snapshot FROM public.assess_application_portfolio_snapshots WHERE id=$1', [snapshot.resource.id]);
    const waveByApp = Object.fromEntries(persisted.rows[0].snapshot.waves.map((row) => [row.applicationId, row.wave]));
    assert(waveByApp[readyApp] === 1 && waveByApp[gatedApp] === 2 && waveByApp[insufficientApp] === 3, 'DEPENDENCY_WAVE_ORDER_FAILED');
  });
  await scenario('hard-gated and insufficient-evidence wave qualification', async () => {
    const result = await client.query('SELECT snapshot FROM public.assess_application_portfolio_snapshots ORDER BY created_at DESC LIMIT 1');
    const qualified = Object.fromEntries(result.rows[0].snapshot.waves.map((row) => [row.applicationId, row.qualified]));
    assert(qualified[readyApp] === true, 'VERIFIED_UNGATED_APP_NOT_QUALIFIED');
    assert(qualified[gatedApp] === false, 'HARD_GATED_APP_QUALIFIED');
    assert(qualified[insufficientApp] === false, 'INSUFFICIENT_EVIDENCE_APP_QUALIFIED');
  });
  await expectSqlFailure('stale snapshot expected-version rejection', 'PR1G_VERSION_CONFLICT', () => createSnapshot(0));

  await scenario('full projection shape and nested committed authority data', async () => {
    const result = await client.query('SELECT public.pr1g_read_application_portfolio_projection($1,$2) projection', [ORG, WS]);
    const projection = result.rows[0].projection;
    for (const key of ['inventory', 'metadataVersions', 'importReceipts', 'rowOutcomes', 'processLinks', 'dependencies', 'assessments', 'dimensions', 'recommendations', 'reviews', 'portfolioSnapshot', 'waves', 'economicsReferences']) {
      assert(Object.hasOwn(projection, key), `PROJECTION_KEY_MISSING_${key}`);
    }
    const inventory = projection.inventory.find((row) => row.id === gatedApp);
    assert(inventory?.metadata?.name === 'Gated UI' && inventory.metadataVersion === 1 && Array.isArray(inventory.evidence) && inventory.evidence.length === 7, 'PROJECTION_INVENTORY_SHAPE_FAILED');
    const nested = projection.assessments.find((row) => row.id === gatedAssessment);
    assert(nested?.metadataVersion === 1 && nested.version === 1 && nested.dimensions.length === 7 && nested.recommendations.length === 1, 'PROJECTION_NESTED_ASSESSMENT_SHAPE_FAILED');
    assert(projection.importReceipts.some((row) => row.id === importReceiptId), 'PROJECTION_IMPORT_RECEIPT_MISSING');
    assert(projection.rowOutcomes.filter((row) => row.importReceiptId === importReceiptId).length === 5, 'PROJECTION_ROW_OUTCOMES_MISSING');
  });

  const lifecycleApp = await createApplication('Lifecycle authority');
  await createMetadata(lifecycleApp, canonicalMetadata('Lifecycle authority'), evidenceFor());
  const lifecycleDraft = nextUuid();
  await saveAssessment(lifecycleApp, lifecycleDraft);
  const lifecycleReady = (await finalizeAssessment(lifecycleApp, lifecycleDraft, 1)).resource;
  await expectSqlFailure('self-review denial', 'PR1G_PERMISSION_DENIED', () => resolveReview(client, ACTOR, lifecycleApp, lifecycleReady.id, 2, `self-review-${nextUuid()}`));
  const reviewKey = `review-replay-${nextUuid()}`;
  const reviewed = await scenario('review resolution exact replay success', async () => {
    const first = await resolveReview(client, REVIEWER_A, lifecycleApp, lifecycleReady.id, 2, reviewKey);
    const replay = await resolveReview(client, REVIEWER_A, lifecycleApp, lifecycleReady.id, 2, reviewKey);
    assert(first.resource.id === replay.resource.id && first.resource.version === replay.resource.version, 'REVIEW_EXACT_REPLAY_FAILED');
    return first.resource;
  });
  await expectSqlFailure('review changed-payload idempotency conflict', 'PR1G_IDEMPOTENCY_CONFLICT', () => resolveReview(client, REVIEWER_A, lifecycleApp, lifecycleReady.id, 2, reviewKey, 'approved'));
  await expectSqlFailure('stale review resolution rejection', 'PR1G_VERSION_CONFLICT', () => resolveReview(client, REVIEWER_B, lifecycleApp, lifecycleReady.id, 2, `stale-review-${nextUuid()}`));
  const revisionKey = `revision-replay-${nextUuid()}`;
  const revised = await scenario('revision start exact replay success', async () => {
    const first = await startRevision(client, lifecycleApp, reviewed.id, 3, revisionKey);
    const replay = await startRevision(client, lifecycleApp, reviewed.id, 3, revisionKey);
    assert(first.resource.id === replay.resource.id && first.resource.version === replay.resource.version, 'REVISION_EXACT_REPLAY_FAILED');
    return first.resource;
  });
  await expectSqlFailure('revision changed-payload idempotency conflict', 'PR1G_IDEMPOTENCY_CONFLICT', () => startRevision(client, lifecycleApp, reviewed.id, 3, revisionKey, 'Changed payload'));
  await expectSqlFailure('stale revision-start rejection', 'PR1G_VERSION_CONFLICT', () => startRevision(client, lifecycleApp, reviewed.id, 3, `stale-revision-${nextUuid()}`));
  assert(revised.version === 4, 'REVISION_VERSION_FAILED');

  const mismatchApp = await createApplication('Mismatch authority');
  await createMetadata(mismatchApp, canonicalMetadata('Mismatch authority'), evidenceFor());
  const mismatchDraft = nextUuid();
  await saveAssessment(mismatchApp, mismatchDraft);
  await expectSqlFailure('metadata-version mismatch rejection', 'PR1G_VERSION_CONFLICT', () => finalizeAssessment(mismatchApp, mismatchDraft, 1, 2));
  await expectSqlFailure('application mismatch rejection', 'PR1G_VERSION_CONFLICT', () => finalizeAssessment(gatedApp, mismatchDraft, 1, 1));

  const ancestryApp = await createApplication('Superseded ancestry');
  await createMetadata(ancestryApp, canonicalMetadata('Superseded ancestry'), evidenceFor());
  const ancestryV1 = nextUuid();
  const ancestryV2 = nextUuid();
  await saveAssessment(ancestryApp, ancestryV1);
  await saveAssessment(ancestryApp, ancestryV2, {}, 1, 2);
  await expectSqlFailure('superseded ancestry rejection', 'PR1G_VERSION_CONFLICT', () => finalizeAssessment(ancestryApp, ancestryV1, 1));

  const concurrentApp = await createApplication('Concurrent review');
  await createMetadata(concurrentApp, canonicalMetadata('Concurrent review'), evidenceFor());
  const concurrentDraft = nextUuid();
  await saveAssessment(concurrentApp, concurrentDraft);
  const concurrentReady = (await finalizeAssessment(concurrentApp, concurrentDraft, 1)).resource;
  await scenario('concurrent review resolution using separate PostgreSQL sessions', async () => {
    const reviewerOne = new pg.Client({ connectionString: url });
    const reviewerTwo = new pg.Client({ connectionString: url });
    await Promise.all([reviewerOne.connect(), reviewerTwo.connect()]);
    try {
      const outcomes = await Promise.allSettled([
        resolveReview(reviewerOne, REVIEWER_A, concurrentApp, concurrentReady.id, 2, `concurrent-review-a-${nextUuid()}`, 'approved'),
        resolveReview(reviewerTwo, REVIEWER_B, concurrentApp, concurrentReady.id, 2, `concurrent-review-b-${nextUuid()}`, 'changes_requested'),
      ]);
      const successes = outcomes.filter((outcome) => outcome.status === 'fulfilled');
      const failures = outcomes.filter((outcome) => outcome.status === 'rejected');
      assert(successes.length === 1 && failures.length === 1, 'CONCURRENT_REVIEW_SINGLE_COMMIT_REQUIRED');
      const concurrentFailure = String(failures[0].reason?.message);
      assert(concurrentFailure.includes('PR1G_VERSION_CONFLICT'), `CONCURRENT_REVIEW_WRONG_FAILURE: ${concurrentFailure}`);
      const persisted = await client.query('SELECT count(*)::int n FROM public.assess_application_review_resolutions WHERE assessment_version_id=$1', [concurrentReady.id]);
      assert(persisted.rows[0].n === 1, 'CONCURRENT_REVIEW_RESOLUTION_COUNT_FAILED');
    } finally {
      await Promise.all([reviewerOne.end(), reviewerTwo.end()]);
    }
  });

  console.log(`PR 1G PostgreSQL 16 executable behavioral scenarios passed: ${executed.length} scenarios: ${executed.join('; ')}.`);
} finally {
  await client.end();
}

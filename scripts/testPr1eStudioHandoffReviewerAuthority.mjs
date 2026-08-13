import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const adminUrl = process.env.PR1E_REVIEW_AUTHORITY_DATABASE_URL;
if (!adminUrl) {
  console.error('PR1E_REVIEW_AUTHORITY_DATABASE_URL is required.');
  process.exit(1);
}

const { Client } = pg;
const dbName = 'avalaos_pr1e_reviewer_authority_test';
const createdRoles = [];
const urlFor = (name) => {
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.toString();
};
const connect = async (url) => {
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
};
const tx = async (client, sql) => {
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
};
const asRole = async (client, role, operation) => {
  await client.query(`SET ROLE ${role}`);
  try {
    return await operation();
  } finally {
    await client.query('RESET ROLE');
  }
};

let admin;
let test;

try {
  admin = await connect(adminUrl);
  for (const [role, attrs] of [
    ['anon', 'NOLOGIN'],
    ['authenticated', 'NOLOGIN'],
    ['service_role', 'NOLOGIN BYPASSRLS'],
  ]) {
    const exists = await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]);
    if (!exists.rowCount) {
      await admin.query(`CREATE ROLE ${role} ${attrs}`);
      createdRoles.push(role);
    }
  }

  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${dbName}`);
  test = await connect(urlFor(dbName));

  await tx(
    test,
    "CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid'; GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;",
  );

  const migrations = fs
    .readdirSync('supabase/migrations')
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const name of migrations) {
    await tx(test, fs.readFileSync(path.join('supabase/migrations', name), 'utf8'));
  }

  const helperSignature =
    'public.pr1e_assert_current_approved_review_authority(uuid,uuid,uuid,uuid,bigint)';
  const wrapperSignature =
    'public.pr1e_handoff_assess_v2_studio(uuid,uuid,uuid,uuid,uuid,bigint,uuid,text,bigint,jsonb)';

  assert.equal(
    (
      await test.query(
        "SELECT has_function_privilege('service_role',$1,'EXECUTE') allowed",
        [helperSignature],
      )
    ).rows[0].allowed,
    false,
    'review-authority helper is not a service-role API surface',
  );
  assert.equal(
    (
      await test.query(
        "SELECT has_function_privilege('authenticated',$1,'EXECUTE') allowed",
        [wrapperSignature],
      )
    ).rows[0].allowed,
    false,
    'authenticated cannot call the private handoff RPC',
  );
  assert.equal(
    (
      await test.query(
        "SELECT has_function_privilege('service_role',$1,'EXECUTE') allowed",
        [wrapperSignature],
      )
    ).rows[0].allowed,
    true,
    'service_role retains the handoff RPC',
  );

  const reviewer = '97000000-0000-4000-8000-000000000001';
  const handoffActor = '97000000-0000-4000-8000-000000000002';
  const submitter = '97000000-0000-4000-8000-000000000003';
  const org = '97000000-0000-4000-8000-000000000010';
  const workspace = '97000000-0000-4000-8000-000000000011';
  const processId = '97000000-0000-4000-8000-000000000012';
  const caseId = '97000000-0000-4000-8000-000000000013';
  const sourceVersion = '97000000-0000-4000-8000-000000000014';
  const decisionId = '97000000-0000-4000-8000-000000000015';
  const reviewId = '97000000-0000-4000-8000-000000000016';
  const evidenceId = '97000000-0000-4000-8000-000000000017';
  const attestationId = '97000000-0000-4000-8000-000000000018';
  const resolutionId = '97000000-0000-4000-8000-000000000019';
  const reviewerRole = '97000000-0000-4000-8000-000000000020';
  const handoffRole = '97000000-0000-4000-8000-000000000021';

  await test.query('INSERT INTO auth.users(id) VALUES($1),($2),($3)', [
    reviewer,
    handoffActor,
    submitter,
  ]);
  await test.query(
    "INSERT INTO public.profiles(id,email) VALUES($1,'reviewer-authority@example.invalid'),($2,'handoff-authority@example.invalid'),($3,'submitter-authority@example.invalid')",
    [reviewer, handoffActor, submitter],
  );
  await test.query(
    "INSERT INTO public.organizations(id,name,slug) VALUES($1,'PR1E Reviewer Authority','pr1e-reviewer-authority')",
    [org],
  );
  await test.query(
    "INSERT INTO public.workspaces(id,org_id,name,slug) VALUES($1,$2,'PR1E Authority Workspace','authority')",
    [workspace, org],
  );
  await test.query(
    "INSERT INTO public.roles(id,org_id,name,slug,scope,permissions) VALUES($1,$2,'Independent Reviewer','independent-reviewer','organization','[]'),($3,$2,'Studio Handoff','studio-handoff','organization','[]')",
    [reviewerRole, org, handoffRole],
  );
  await test.query(
    `INSERT INTO public.role_capabilities(role_id,capability_key) VALUES
      ($1,'assess.v2.review'),
      ($1,'assess.v2.evidence.attest'),
      ($1,'assess.v2.approve'),
      ($2,'assess.v2.studio.handoff')`,
    [reviewerRole, handoffRole],
  );
  await test.query(
    `INSERT INTO public.organization_members(org_id,user_id,role_id,status) VALUES
      ($1,$2,$3,'active'),
      ($1,$4,$5,'active')`,
    [org, reviewer, reviewerRole, handoffActor, handoffRole],
  );
  await test.query(
    `INSERT INTO public.workspace_memberships(org_id,workspace_id,user_id,status) VALUES
      ($1,$2,$3,'active'),
      ($1,$2,$4,'active')`,
    [org, workspace, reviewer, handoffActor],
  );

  const authorizationVersion = async (actor) =>
    Number(
      (
        await test.query(
          'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',
          [org, actor],
        )
      ).rows[0].version,
    );

  const reviewerAuthorizationVersion = await authorizationVersion(reviewer);
  const handoffAuthorizationVersion = await authorizationVersion(handoffActor);
  assert.ok(reviewerAuthorizationVersion > 0);
  assert.ok(handoffAuthorizationVersion > 0);

  await test.query(
    "INSERT INTO public.assess_processes(id,org_id,workspace_id,name,status) VALUES($1,$2,$3,'Reviewer Authority Process','Draft')",
    [processId, org, workspace],
  );
  await test.query(
    "INSERT INTO public.assess_v2_cases(id,org_id,workspace_id,process_id,owner_id,status,version) VALUES($1,$2,$3,$4,$5,'govern_resolved',2)",
    [caseId, org, workspace, processId, submitter],
  );
  await test.query(
    "INSERT INTO public.assess_v2_case_versions(id,case_id,org_id,workspace_id,version,name,source_kind,created_by) VALUES($1,$2,$3,$4,2,'Reviewer Authority Source','create',$5)",
    [sourceVersion, caseId, org, workspace, submitter],
  );
  await test.query('UPDATE public.assess_v2_cases SET head_version_id=$1 WHERE id=$2', [
    sourceVersion,
    caseId,
  ]);

  const receiptIds = {
    decision: '97100000-0000-4000-8000-000000000001',
    assignment: '97100000-0000-4000-8000-000000000002',
    attestation: '97100000-0000-4000-8000-000000000003',
    resolution: '97100000-0000-4000-8000-000000000004',
    replay: '97100000-0000-4000-8000-000000000005',
  };
  const fixtureReceipt = async (id, actor, key) => {
    await test.query(
      `INSERT INTO public.assess_command_receipts
        (id,org_id,workspace_id,actor_id,command_type,idempotency_key,request_id,request_hash,status,response,completed_at)
       VALUES($1,$2,$3,$4,'fixture',$5,gen_random_uuid(),'fixture-hash','succeeded','{}',now())`,
      [id, org, workspace, actor, key],
    );
  };
  await fixtureReceipt(receiptIds.decision, reviewer, 'authority-decision');
  await fixtureReceipt(receiptIds.assignment, handoffActor, 'authority-assignment');
  await fixtureReceipt(receiptIds.attestation, reviewer, 'authority-attestation');
  await fixtureReceipt(receiptIds.resolution, reviewer, 'authority-resolution');

  const hash = '0'.repeat(64);
  await test.query(
    `INSERT INTO public.assess_v2_evidence_links(id,version_id,case_id,org_id,workspace_id,payload)
     VALUES($1,$2,$3,$4,$5,$6)`,
    [
      evidenceId,
      sourceVersion,
      caseId,
      org,
      workspace,
      { claimIds: ['claim.material'], status: 'submitted', validated: false },
    ],
  );
  await test.query(
    `INSERT INTO public.assess_v2_decision_versions
      (id,case_id,source_version_id,org_id,workspace_id,schema_version,rule_set_version,decision_version,
       validation_status,input_snapshot,evidence_snapshot,output_snapshot,input_hash,evidence_hash,output_hash,
       receipt_id,created_by,created_at)
     VALUES($1,$2,$3,$4,$5,'schema','rules','decision-authority','reviewer-ready','{}','[]',$6,$7,$7,$7,$8,$9,now())`,
    [
      decisionId,
      caseId,
      sourceVersion,
      org,
      workspace,
      { trace: [{ fieldIds: ['claim.material'], evidenceIds: [evidenceId] }], controls: ['Audit'] },
      hash,
      receiptIds.decision,
      submitter,
    ],
  );
  await test.query(
    `INSERT INTO public.assess_v2_review_assignments
      (id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,
       review_schema_version,review_sequence,material_claims,reviewer_id,assigned_by,
       assigned_reviewer_authorization_version,assigned_by_authorization_version,request_id,receipt_id,audit_event_id)
     VALUES($1,$2,$3,$4,$5,2,$6,'decision-authority','assess-v2-review-2026-07',1,$7,$8,$9,$10,$11,gen_random_uuid(),$12,gen_random_uuid())`,
    [
      reviewId,
      org,
      workspace,
      caseId,
      sourceVersion,
      decisionId,
      [{ claimId: 'claim.material', evidenceIds: [evidenceId] }],
      reviewer,
      handoffActor,
      reviewerAuthorizationVersion,
      handoffAuthorizationVersion,
      receiptIds.assignment,
    ],
  );
  await test.query(
    `INSERT INTO public.assess_v2_evidence_attestations
      (id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,
       review_id,review_schema_version,review_sequence,evidence_id,claim_ids,evidence_submitter_id,
       reviewer_id,reviewer_authorization_version,outcome,rationale,request_id,receipt_id,audit_event_id)
     VALUES($1,$2,$3,$4,$5,2,$6,'decision-authority',$7,'assess-v2-review-2026-07',1,$8,
       ARRAY['claim.material'],$9,$10,$11,'accepted','authority verified',gen_random_uuid(),$12,gen_random_uuid())`,
    [
      attestationId,
      org,
      workspace,
      caseId,
      sourceVersion,
      decisionId,
      reviewId,
      evidenceId,
      submitter,
      reviewer,
      reviewerAuthorizationVersion,
      receiptIds.attestation,
    ],
  );
  await test.query(
    `INSERT INTO public.assess_v2_review_resolutions
      (id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,
       review_id,review_schema_version,review_sequence,resolution,reviewed_confidence,rationale,
       reviewer_id,reviewer_authorization_version,request_id,receipt_id,audit_event_id)
     VALUES($1,$2,$3,$4,$5,2,$6,'decision-authority',$7,'assess-v2-review-2026-07',1,
       'approved','Verified','authority verified',$8,$9,gen_random_uuid(),$10,gen_random_uuid())`,
    [
      resolutionId,
      org,
      workspace,
      caseId,
      sourceVersion,
      decisionId,
      reviewId,
      reviewer,
      reviewerAuthorizationVersion,
      receiptIds.resolution,
    ],
  );

  await test.query(
    'SELECT public.pr1e_assert_current_approved_review_authority($1,$2,$3,$4,$5)',
    [org, workspace, caseId, decisionId, 1],
  );

  const firstTimePayload = { reviewSequence: 1 };
  const firstTimeResult = (
    await asRole(test, 'service_role', () =>
      test.query(
        `SELECT public.pr1e_handoff_assess_v2_studio(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
        ) value`,
        [
          handoffActor,
          org,
          workspace,
          caseId,
          decisionId,
          2,
          '97200000-0000-4000-8000-000000000001',
          'fresh-preflight-delegates',
          handoffAuthorizationVersion,
          firstTimePayload,
        ],
      ),
    )
  ).rows[0].value;
  assert.equal(
    firstTimeResult.errorCode,
    'INVALID_COMMAND',
    'fresh reviewer authority reaches the canonical command, which rejects the deliberately absent Govern resolution',
  );

  const beforeRevocationVersion = await authorizationVersion(reviewer);
  await test.query(
    "DELETE FROM public.role_capabilities WHERE role_id=$1 AND capability_key='assess.v2.approve'",
    [reviewerRole],
  );
  const revokedReviewerVersion = await authorizationVersion(reviewer);
  assert.ok(
    revokedReviewerVersion > beforeRevocationVersion,
    'reviewer authorization version advances on capability revocation',
  );

  await assert.rejects(
    test.query(
      'SELECT public.pr1e_assert_current_approved_review_authority($1,$2,$3,$4,$5)',
      [org, workspace, caseId, decisionId, 1],
    ),
    /PR1E_REVIEW_AUTHORIZATION_STALE/,
  );

  const staleKey = 'stale-reviewer-blocks-new-handoff';
  const staleResult = (
    await asRole(test, 'service_role', () =>
      test.query(
        `SELECT public.pr1e_handoff_assess_v2_studio(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
        ) value`,
        [
          handoffActor,
          org,
          workspace,
          caseId,
          decisionId,
          2,
          '97200000-0000-4000-8000-000000000002',
          staleKey,
          handoffAuthorizationVersion,
          firstTimePayload,
        ],
      ),
    )
  ).rows[0].value;
  assert.equal(staleResult.errorCode, 'AUTHORIZATION_STALE');
  assert.equal(
    Number(
      (
        await test.query(
          `SELECT count(*) n
           FROM public.assess_command_receipts
           WHERE org_id=$1 AND actor_id=$2
             AND command_type='assessment_v2.studio.handoff'
             AND idempotency_key=$3`,
          [org, handoffActor, staleKey],
        )
      ).rows[0].n,
    ),
    0,
    'stale-reviewer rejection writes no handoff receipt',
  );
  assert.equal(
    Number(
      (
        await test.query(
          'SELECT count(*) n FROM public.assess_v2_studio_handoffs WHERE case_id=$1',
          [caseId],
        )
      ).rows[0].n,
    ),
    0,
    'stale-reviewer rejection writes no Studio handoff',
  );

  await test.query(
    "INSERT INTO public.role_capabilities(role_id,capability_key) VALUES($1,'assess.v2.approve')",
    [reviewerRole],
  );
  const restoredReviewerVersion = await authorizationVersion(reviewer);
  assert.ok(
    restoredReviewerVersion > revokedReviewerVersion,
    'reviewer authorization version advances again on capability restoration',
  );
  await assert.rejects(
    test.query(
      'SELECT public.pr1e_assert_current_approved_review_authority($1,$2,$3,$4,$5)',
      [org, workspace, caseId, decisionId, 1],
    ),
    /PR1E_REVIEW_AUTHORIZATION_STALE/,
    'restoring the capability does not revive an assignment bound to the old authorization version',
  );

  const replayKey = 'committed-handoff-response-loss-replay';
  const replayPayload = { reviewSequence: 1 };
  const replayHash = (
    await test.query(
      `SELECT encode(
         public.digest(
           concat_ws('|',$1::text,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::bigint,$7::jsonb::text),
           'sha256'
         ),
         'hex'
       ) value`,
      [
        'assessment_v2.studio.handoff',
        org,
        workspace,
        caseId,
        decisionId,
        2,
        replayPayload,
      ],
    )
  ).rows[0].value;
  const replayResponse = {
    id: '97200000-0000-4000-8000-000000000010',
    status: 'handed_off',
    version: 3,
  };
  await test.query(
    `INSERT INTO public.assess_command_receipts
      (id,org_id,workspace_id,actor_id,command_type,idempotency_key,request_id,request_hash,status,response,completed_at)
     VALUES($1,$2,$3,$4,'assessment_v2.studio.handoff',$5,$6,$7,'succeeded',$8,now())`,
    [
      receiptIds.replay,
      org,
      workspace,
      handoffActor,
      replayKey,
      '97200000-0000-4000-8000-000000000011',
      replayHash,
      replayResponse,
    ],
  );

  const replayResult = (
    await asRole(test, 'service_role', () =>
      test.query(
        `SELECT public.pr1e_handoff_assess_v2_studio(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
        ) value`,
        [
          handoffActor,
          org,
          workspace,
          caseId,
          decisionId,
          2,
          '97200000-0000-4000-8000-000000000012',
          replayKey,
          handoffAuthorizationVersion,
          replayPayload,
        ],
      ),
    )
  ).rows[0].value;
  assert.equal(replayResult.outcome, 'replayed');
  assert.deepEqual(replayResult.resource, replayResponse);

  console.log(
    'PR 1E Studio handoff reviewer-authority freshness, no-write rejection, restored-version staleness, and committed replay tests passed.',
  );
} finally {
  if (test) await test.end().catch(() => {});
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => {});
    for (const role of createdRoles.reverse()) {
      await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(() => {});
    }
    await admin.end().catch(() => {});
  }
}

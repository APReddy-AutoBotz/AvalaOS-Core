import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createLegacyDeliveryPostgresFixture,
  LEGACY_DELIVERY_FIXTURE_IDS,
} from './legacyDeliveryPostgresFixture.mjs';

const ROUTINES = Object.freeze([
  {
    name: 'studio_delivery_assignee_query',
    signature: 'public.studio_delivery_assignee_query(uuid,uuid,uuid,bigint,uuid)',
    sql: 'SELECT public.studio_delivery_assignee_query($1,$2,$3,$4,$5) value',
    args: ({ actor, organization, workspace, authorizationVersion, project }) => (
      [actor, organization, workspace, authorizationVersion, project]
    ),
  },
  {
    name: 'studio_delivery_outcome_query',
    signature: 'public.studio_delivery_outcome_query(uuid,uuid,uuid,bigint,uuid,integer,uuid)',
    sql: 'SELECT public.studio_delivery_outcome_query($1,$2,$3,$4,$5,100,NULL) value',
    args: ({ actor, organization, workspace, authorizationVersion, project }) => (
      [actor, organization, workspace, authorizationVersion, project]
    ),
  },
]);

const governedSnapshot = async db => (await db.query(`SELECT jsonb_build_object(
  'profiles',(SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY row.id),'[]'::jsonb) FROM public.profiles row),
  'organizationMembers',(SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY row.org_id,row.user_id),'[]'::jsonb) FROM public.organization_members row),
  'workspaceMemberships',(SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY row.org_id,row.workspace_id,row.user_id),'[]'::jsonb) FROM public.workspace_memberships row),
  'authorizationVersions',(SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY row.org_id,row.user_id),'[]'::jsonb) FROM public.authorization_versions row),
  'projects',(SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY row.id),'[]'::jsonb) FROM public.projects row),
  'outcomeAggregates',(SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY row.id),'[]'::jsonb) FROM public.legacy_delivery_outcome_aggregates row),
  'outcomeVersions',(SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY row.id),'[]'::jsonb) FROM public.legacy_delivery_outcome_versions row)
) value`)).rows[0].value;

test('Studio Delivery projections use PostgREST read-write admission while preserving governed read authority', { timeout: 300_000 }, async () => {
  const fixture = await createLegacyDeliveryPostgresFixture();
  try {
    const x = LEGACY_DELIVERY_FIXTURE_IDS;
    const authorizationVersion = await fixture.authorizationVersion(x.actor);
    const context = {
      actor: x.actor,
      organization: x.organization,
      workspace: x.workspace,
      authorizationVersion,
      project: x.project,
    };
    const before = await governedSnapshot(fixture.db);

    for (const routine of ROUTINES) {
      const metadata = (await fixture.db.query(`SELECT
        p.provolatile volatility,p.prosecdef security_definer,p.proconfig config,
        p.proowner::regrole::text owner,
        has_function_privilege('service_role',$1,'EXECUTE') service_execute,
        has_function_privilege('authenticated',$1,'EXECUTE') authenticated_execute,
        has_function_privilege('anon',$1,'EXECUTE') anon_execute,
        pg_get_functiondef(p.oid) definition
        FROM pg_proc p WHERE p.oid=$1::regprocedure`, [routine.signature])).rows[0];
      assert.equal(metadata.volatility, 'v', `${routine.name} must be VOLATILE so PostgREST does not force a read-only transaction`);
      assert.equal(metadata.security_definer, true);
      assert.equal(metadata.owner, 'postgres');
      assert.ok(metadata.config?.some(value => value.startsWith('search_path=')), 'fixed search_path must remain configured');
      assert.equal(metadata.service_execute, true);
      assert.equal(metadata.authenticated_execute, false);
      assert.equal(metadata.anon_execute, false);
      assert.match(metadata.definition, /legacy_delivery_assert_any_authority/);

      await fixture.db.query('BEGIN READ ONLY');
      try {
        await fixture.db.query('SET LOCAL ROLE service_role');
        const rejected = (await fixture.db.query(routine.sql, routine.args(context))).rows[0].value;
        assert.equal(rejected.ok, false);
        assert.equal(rejected.errorCode, 'COMMAND_UNAVAILABLE',
          `${routine.name} must expose the row-lock conflict if an adapter incorrectly classifies it read-only`);
      } finally {
        await fixture.db.query('ROLLBACK');
      }

      const allowed = await fixture.asRole('service_role', async () => (
        await fixture.db.query(routine.sql, routine.args(context))
      ));
      assert.equal(allowed.rows[0].value.ok, true, `${routine.name} must succeed in PostgREST's VOLATILE transaction mode`);

      await assert.rejects(
        fixture.asRole('authenticated', () => fixture.db.query(routine.sql, routine.args(context))),
        error => error?.code === '42501',
        `${routine.name} must remain unavailable to authenticated SQL callers`,
      );
    }

    assert.deepEqual(await governedSnapshot(fixture.db), before, 'projection calls and rejected calls must not write governed state');
  } finally {
    await fixture.close();
  }
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const migrationPath = 'supabase/migrations/20261107120000_planning_discovery_resolution.sql';

test('planning-approved discovery sources retain their exact purpose and source bindings', async () => {
  const sql = (await readFile(migrationPath, 'utf8')).replaceAll('\r\n', '\n');
  const validationStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.studio_delivery_discovery_resolution_valid(');
  const validationEnd = sql.indexOf('END $$;', validationStart) + 'END $$;'.length;
  const validation = sql.slice(validationStart, validationEnd);
  const outcomeStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.studio_delivery_outcome_query(');
  const outcomeEnd = sql.indexOf('END $$;', outcomeStart) + 'END $$;'.length;
  const outcome = sql.slice(outcomeStart, outcomeEnd);

  assert.ok(validationStart >= 0 && validationEnd > validationStart);
  assert.ok(outcomeStart >= 0 && outcomeEnd > outcomeStart);
  for (const definition of [validation, outcome]) {
    assert.match(definition, /review\.id=p_publication\.review_resolution_id|review\.id=publication\.review_resolution_id/);
    assert.match(definition, /review\.case_id=p_publication\.source_case_id|review\.case_id=publication\.source_case_id/);
    assert.match(definition, /review\.decision_id=p_publication\.source_decision_id|review\.decision_id=publication\.source_decision_id/);
    assert.match(definition, /review\.approval_purpose=p_publication\.approval_purpose|review\.approval_purpose=publication\.approval_purpose/);
    assert.match(definition, /(?:review\.review_id=attestation\.review_id|attestation\.review_id=review\.review_id)/);
    assert.match(definition, /(?:review\.source_version_id=attestation\.source_version_id|attestation\.source_version_id=review\.source_version_id)/);
    assert.match(definition, /(?:review\.org_id=attestation\.org_id|attestation\.org_id=review\.org_id)/);
    assert.match(definition, /(?:review\.workspace_id=attestation\.workspace_id|attestation\.workspace_id=review\.workspace_id)/);
    assert.match(definition, /attestation\.outcome='accepted'/);
    assert.match(definition, /review\.resolution='approved' AND review\.approval_purpose='implementation_readiness'/);
    assert.match(definition, /review\.resolution='planning_approved' AND review\.approval_purpose='documentation_planning'/);
    assert.match(definition, /govern_resolution_id IS NOT NULL/);
    assert.match(definition, /govern_resolution_id IS NULL/);
    assert.doesNotMatch(definition, /review\.resolution IN\('approved','planning_approved'\)/);
  }
});

test('forward repair preserves private helper and service-only projection authority', async () => {
  const sql = (await readFile(migrationPath, 'utf8')).replaceAll('\r\n', '\n');
  assert.match(sql, /RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.studio_delivery_discovery_resolution_valid[\s\S]+FROM PUBLIC,anon,authenticated,service_role;/);
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.studio_delivery_discovery_resolution_valid/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.studio_delivery_outcome_query[\s\S]+FROM PUBLIC,anon,authenticated;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.studio_delivery_outcome_query\(uuid,uuid,uuid,bigint,uuid,integer,uuid\) TO service_role;/);
  assert.match(sql, /ALTER FUNCTION public\.studio_delivery_outcome_query\(uuid,uuid,uuid,bigint,uuid,integer,uuid\) VOLATILE;/);
  assert.doesNotMatch(sql, /hosted_pilot_environment_identity|process_evidence_renew_provider_run_after_use/,
    'the final integrated migration owns runtime identity and provider permit-tip advancement');
});

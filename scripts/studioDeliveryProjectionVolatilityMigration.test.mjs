import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const migrationPath = 'supabase/migrations/20261107110000_delivery_discovery_resolution.sql';

test('candidate migration admits the two locking Studio projections through PostgREST read-write transactions', async () => {
  const sql = (await readFile(migrationPath, 'utf8')).replaceAll('\r\n', '\n');
  const assignee = 'ALTER FUNCTION public.studio_delivery_assignee_query(uuid,uuid,uuid,bigint,uuid) VOLATILE;';
  const outcome = 'ALTER FUNCTION public.studio_delivery_outcome_query(uuid,uuid,uuid,bigint,uuid,integer,uuid) VOLATILE;';
  const identity = 'DO $delivery_discovery_identity$';
  const outcomeStart = sql.lastIndexOf('CREATE OR REPLACE FUNCTION public.studio_delivery_outcome_query(');
  const outcomeEnd = sql.indexOf('END $$;', outcomeStart) + 'END $$;'.length;
  const outcomeDefinition = sql.slice(outcomeStart, outcomeEnd);

  assert.equal(sql.split(assignee).length - 1, 1, 'the assignee projection must have one exact volatility correction');
  assert.equal(sql.split(outcome).length - 1, 1, 'the outcome projection must have one exact volatility correction');
  assert.ok(sql.indexOf(assignee) < sql.indexOf(identity));
  assert.ok(sql.indexOf(outcome) < sql.indexOf(identity));
  assert.ok(outcomeStart >= 0 && outcomeEnd > outcomeStart);
  assert.match(outcomeDefinition, /RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''/);
  assert.match(outcomeDefinition, /legacy_delivery_assert_any_authority/);

  assert.match(sql, /REVOKE ALL ON FUNCTION public\.studio_delivery_outcome_query\(uuid,uuid,uuid,bigint,uuid,integer,uuid\) FROM PUBLIC,anon,authenticated;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.studio_delivery_outcome_query\(uuid,uuid,uuid,bigint,uuid,integer,uuid\) TO service_role;/);
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.studio_delivery_(?:assignee|outcome)_query\([^;]+\) TO (?:PUBLIC|anon|authenticated)/);
});

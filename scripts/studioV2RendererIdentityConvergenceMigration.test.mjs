import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const installed = readFileSync(
  'supabase/migrations/20261106040803_studio_v2_rendition_renderer.sql',
);
const predecessor = readFileSync(
  'supabase/migrations/20261106020001_studio_response_reconciliation.sql',
  'utf8',
);
const repair = readFileSync(
  'supabase/migrations/20261106045007_studio_v2_renderer_identity_convergence.sql',
  'utf8',
);
const functionIdentities = source => [...source.matchAll(
  /'public\.([^']+)'::regprocedure/gu,
)].map(match => match[1]);

test('installed renderer migration remains byte-for-byte immutable', () => {
  assert.equal(
    createHash('sha256').update(installed).digest('hex'),
    '72a678e270212ea3d87bbe538202b66b77a0e86478b63a3bccda39669a8143d5',
  );
});

test('convergence rewrites the complete predecessor routine set with authority guards', () => {
  const predecessorForward = predecessor.slice(
    predecessor.indexOf('DO $studio_response_reconciliation_identity_forward$'),
  );
  assert.deepEqual(functionIdentities(repair), functionIdentities(predecessorForward));
  for (const token of [
    "function_old_tip text := '20261106020001'",
    "marker_old_tip text := '20261106040803'",
    "new_tip text := '20261106045007'",
    'old_count <> 1 OR new_count <> 0',
    'metadata_after IS DISTINCT FROM metadata_before',
    'STUDIO_V2_RENDERER_FUNCTION_SOURCE_MISMATCH',
    'STUDIO_V2_RENDERER_FUNCTION_AUTHORITY_DRIFT',
    "'owner', p.proowner",
    "'securityDefiner', p.prosecdef",
    "'config', p.proconfig",
    "'acl', p.proacl",
  ]) assert.ok(repair.includes(token), token);
});

test('convergence advances only the exact nonproduction marker and tip allowlists', () => {
  assert.match(repair, /migration_tip = marker_old_tip/u);
  assert.match(repair, /NOT production_authorized/u);
  assert.match(repair, /NOT customer_data_authorized/u);
  assert.match(repair, /NOT real_provider_calls_authorized/u);
  assert.match(repair, /authenticated_synthetic_exercises WHERE lifecycle = 'active'/u);
  assert.equal((repair.match(/'20261106045007'/gu) ?? []).length, 4);
  assert.doesNotMatch(repair, /DELETE\s+FROM/iu);
  assert.doesNotMatch(repair, /UPDATE\s+public\.(?!hosted_pilot_environment_identity)/iu);
});

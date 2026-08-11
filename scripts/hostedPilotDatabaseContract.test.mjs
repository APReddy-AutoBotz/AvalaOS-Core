import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration=await readFile(new URL('../supabase/migrations/20260811120000_hosted_nonproduction_pilot_activation.sql',import.meta.url),'utf8');
test('identity and mutation surfaces fail closed',()=>{
  assert.match(migration,/product_key = 'avalaos-core'/);
  assert.match(migration,/CHECK \(NOT production_authorized\)/);
  assert.match(migration,/HOSTED_PILOT_IDENTITY_MISMATCH/);
  assert.match(migration,/FORCE ROW LEVEL SECURITY/g);
  assert.match(migration,/FROM PUBLIC,anon,authenticated/);
});
test('bootstrap is bounded, synthetic, idempotent and deprovisionable',()=>{
  for(const role of ['owner','operator','reviewer','revoked','cross_tenant']) assert.match(migration,new RegExp(`'${role}'`));
  assert.match(migration,/synthetic_only boolean NOT NULL DEFAULT true CHECK \(synthetic_only\)/);
  assert.match(migration,/ON CONFLICT\(org_id,workspace_id,subject_key\) DO UPDATE/);
  assert.match(migration,/p_operation NOT IN \('bootstrap','deprovision','replay'\)/);
});
test('provider simulator is deterministic and cannot perform egress',()=>{
  assert.match(migration,/avalaos-deterministic-simulator-v1/);
  assert.match(migration,/zero_egress boolean NOT NULL DEFAULT true CHECK \(zero_egress\)/);
  assert.match(migration,/'realProviderCalled',false/);
  assert.match(migration,/pg_advisory_xact_lock/);
  assert.match(migration,/hosted_pilot_provider_simulations_immutable/);
  assert.doesNotMatch(migration,/https?:\/\//i);
  assert.doesNotMatch(migration,/openai|anthropic|gemini|groq|azure/i);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createAuthenticatedControlsPostgresAdapter } from './authenticatedControlsPostgresAdapter.mjs';

test('PostgreSQL adapter refuses an incomplete authority and database binding', async () => {
  await assert.rejects(() => createAuthenticatedControlsPostgresAdapter({}),
    /AUTHENTICATED_CONTROLS_POSTGRES_INPUT_REQUIRED/u);
});

test('AI-004 adapter composes the production receipt, transition and completion RPCs', () => {
  const source = readFileSync(new URL('./authenticatedControlsPostgresAdapter.mjs', import.meta.url), 'utf8');
  for (const boundary of ['enterprise_ai_claim_command', 'enterprise_ai_plan_command',
    'enterprise_provider_lifecycle_transition', 'enterprise_ai_complete_command']) {
    assert.match(source, new RegExp(boundary, 'u'));
  }
  assert.match(source, /executeProviderLifecycleCommand\('provider\.secret\.bind'/u);
  assert.match(source, /providerCalls: observations\.providerRequests/u);
  assert.match(source, /to_jsonb\(config\)/u);
  assert.match(source, /to_jsonb\(key\)/u);
  assert.match(source, /AUTHENTICATED_CONTROLS_PERSISTED_PROOF_MISSING/u);
  assert.doesNotMatch(source, /to_jsonb\([^)]*\)\s*-/u);
  assert.doesNotMatch(source, /return \{[^}]*secretRef/u);
});

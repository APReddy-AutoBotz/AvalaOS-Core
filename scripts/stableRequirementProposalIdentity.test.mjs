import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile('supabase/migrations/20261103170101_stable_requirement_proposal_identity.sql', 'utf8');

assert.match(migration, /ADD COLUMN proposal_role text NOT NULL DEFAULT 'legacy'/u);
assert.doesNotMatch(migration, /UPDATE public\.studio_delivery_work_item_requirement_bindings/u,
  'populated upgrades must not fire the immutable-row trigger');
assert.match(migration, /studio_delivery_stable_proposal_origin/u);
assert.match(migration, /WHEN 'coordination' THEN 'Epic'[\s\S]*WHEN 'implementation' THEN 'Story'[\s\S]*WHEN 'verification' THEN 'Task'/u,
  'new immutable roles must retain the historical default-type origin domains');
assert.doesNotMatch(
  migration.slice(migration.indexOf('CREATE FUNCTION public.studio_delivery_stable_proposal_origin'), migration.indexOf('DO $stable_proposal_role$')),
  /p_type/u,
  'the user-editable work type must not contribute to the new proposal origin',
);
assert.match(migration, /result->>'outcome'<>'replayed' AND NOT item\?'proposalRole'/u);
assert.match(migration, /COALESCE\(item->>'proposalRole','legacy'\)/u,
  'old exact replays retain the historical origin and role');
assert.match(migration, /item->>'proposalRole',normalized_links/u);
assert.match(migration, /'proposalRole',NULLIF\(binding\.proposal_role,'legacy'\)/u,
  'board lineage retains the immutable proposal role for audit');
assert.match(migration, /'proposalRole',p_item\.source_lineage->>'proposalRole'/u,
  'the normal board projection exposes the role bound to its stable origin');
assert.match(migration, /COALESCE\(existing\.source_lineage->>'proposalRole','legacy'\)='legacy'[\s\S]*'Epic'[\s\S]*'Story'[\s\S]*'Task'/u,
  'a legacy board item from any editable historical type must fail closed before a new role-bound import can duplicate it');

console.log('Stable proposal identity migration: populated upgrade, immutable role, legacy replay and type-independent origin checks passed.');

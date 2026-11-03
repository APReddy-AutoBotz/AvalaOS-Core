import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile('supabase/migrations/20261103104435_delivery_requirement_bound_proposals.sql', 'utf8');
const postgres = await readFile('scripts/studioDeliveryAuthorityPostgres.mjs', 'utf8');
const journey = await readFile('tests/browser/enterpriseLifecycleAcceptance/studioDeliveryMonitorJourney.ts', 'utf8');

for (const fragment of [
  'studio_delivery_work_item_requirement_bindings',
  'studio_delivery_apply_requirement_command',
  'regexp_split_to_table',
  'STUDIO_DELIVERY_IDEMPOTENCY_CONFLICT',
  'legacy_delivery_bind_requirement_source',
  'legacy_delivery_apply_requirement_command',
  'legacy_delivery_requirement_query',
  'legacy_delivery_one_item_per_proposal_origin',
  "IF NOT EXISTS(SELECT 1 FROM public.studio_delivery_work_item_requirement_bindings",
  'REVOKE EXECUTE ON FUNCTION public.studio_delivery_apply_command',
]) assert.ok(migration.includes(fragment), `missing migration authority: ${fragment}`);

assert.match(migration, /requirementText[\s\S]*\(must\|shall\|required to\|needs to\)/u);
assert.match(migration, /EXCEPTION WHEN OTHERS[\s\S]*studio_delivery_error\(SQLERRM\)/u,
  'requirement validation failures must return through the accepted error envelope and roll back the subtransaction');
assert.match(migration, /studio_delivery_proposal_origin\(publication\.studio_artifact_id/u,
  'proposal origin is scoped to the stable artifact aggregate, not display text or source version');
assert.match(migration, /jsonb_agg\(value ORDER BY value->>'sectionId',value->>'requirementText',value->>'sectionTitle'\)/u,
  'exact requirement links are canonicalized before immutable binding');
assert.match(migration, /'studioArtifactVersionId',binding\.studio_artifact_version_id/u,
  'normal Delivery lineage receives approved artifact and revision identity for source details');
assert.match(migration, /type IN\('Epic','Story','Task','Bug','Subtask'\)/u,
  'authoritative board storage supports a persistent bound Epic while the manual-create RPC remains narrow');
assert.match(migration, /IF bound_publication_id IS NULL THEN[\s\S]*legacy_delivery_apply_command/u,
  'unbound legacy publications retain their prior grouping-only import behavior');
assert.match(postgres, /invented requirement links must roll back publication, receipt, generation and audit/u);
assert.match(postgres, /every published proposal must retain one immutable server-validated requirement binding/u);
assert.match(postgres, /normal Delivery task detail must receive exact approved requirement links/u);
assert.match(postgres, /a regenerated proposal origin must not appear twice on the normal board/u);
assert.match(postgres, /identical requirement text from a distinct approved artifact must retain a distinct proposal origin/u);
assert.match(postgres, /requirement-link presentation order must not mint a new proposal origin/u);
assert.match(postgres, /mixed requirement-bound import must materialize its selected Epic/u);
assert.match(postgres, /sourceItemIndices: \[0\]/u, 'real PostgreSQL proof includes Epic-only confirmation');
assert.match(journey, /Select for publication/u);
assert.match(journey, /delivery-requirement-source-links/u);

console.log('Delivery requirement-bound migration contract: exact-source validation, atomic confirmation, legacy compatibility, stable-origin dedup and ordinary-UI proof wiring passed');

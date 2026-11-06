import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { validateLegacyDeliveryDatabaseUrl } from './legacyDeliveryPostgresFixture.mjs';

const workflow = parse(await readFile('.github/workflows/studio-governed-artifacts.yml', 'utf8'));
const postgresJob = workflow.jobs['studio-private-artifacts-postgresql-16'];
const authorityStep = postgresJob.steps.find(step => step.run?.includes('node scripts/deliveryNumberedRequirementsPostgres.mjs'));
const databaseUrl = authorityStep.env.LEGACY_DELIVERY_ACCEPTANCE_DATABASE_URL;
assert.doesNotThrow(() => validateLegacyDeliveryDatabaseUrl(databaseUrl));
assert.equal(new URL(databaseUrl).pathname, `/${postgresJob.services.postgres.env.POSTGRES_DB}`,
  'the guarded publication harness uses the database actually created by CI');
assert.throws(() => validateLegacyDeliveryDatabaseUrl(databaseUrl.replace('/avalaos_exhaustive', '/postgres')),
  /LEGACY_DELIVERY_ACCEPTANCE_DATABASE_URL_REJECTED/u);

const service = await readFile('services/productAcceptanceBridge/requirementProposals.ts', 'utf8');
const test = await readFile('components/docs/StudioApprovedArtifactPublish.test.tsx', 'utf8');
const migration = await readFile('supabase/migrations/20261106070101_delivery_numbered_requirements.sql', 'utf8');
const vocabulary = /accept\|acknowledge\|address\|allow\|apply\|approve\|assign\|authenticate\|authorize\|calculate\|capture\|classify\|collect\|compare\|complete\|configure\|confirm\|create\|detect\|disable\|display\|document\|draft\|enforce\|ensure\|exclude\|extract\|generate\|handle\|identify\|import\|keep\|log\|maintain\|notify\|persist\|preserve\|prevent\|publish\|record\|reject\|require\|resolve\|restrict\|retain\|retrieve\|review\|route\|save\|send\|store\|support\|track\|update\|use\|validate\|verify\|withhold/gu;

assert.equal((service.match(vocabulary) ?? []).length, 1, 'client has one bounded imperative vocabulary');
assert.equal((migration.match(vocabulary) ?? []).length, 2,
  'server repeats the same vocabulary only for duplicate detection and link validation');
for (const fragment of [
  'Source facts from the accepted Assess handoff (for human review; not model-generated reasoning):',
  'document_has_explicit_requirements', 'section_is_explicit_requirement', 'duplicate_numbered_identity',
  'STUDIO_DELIVERY_INVALID_COMMAND', 'metadata_after IS DISTINCT FROM metadata_before',
  "function_old_tip text := '20261106045007'", "new_tip text := '20261106070101'",
  "CHECK (migration_tip='20261106070101')", 'NOT production_authorized', 'NOT real_provider_calls_authorized',
  "!~* '(^|[^a-z])(questions?|assumptions?|proposals?|flows?|diagrams?)([^a-z]|$)'",
  'length(btrim(source_line)) BETWEEN 1 AND 2000',
]) assert.ok(migration.includes(fragment), `missing guarded migration fragment: ${fragment}`);
assert.equal((migration.match(/'public\.[^']+'::regprocedure/gu) ?? []).length, 16,
  'migration guards one publication routine plus the exact 15 synthetic identity routines');
assert.match(service, /Approved numbered requirement identity/u);
assert.match(service, /replace\(\/\[-_\]\+\/gu, ' '\)/u);
assert.match(test, /requirementCount, 11/u);
assert.match(test, /Array\(11\)\.fill\('Story'\)/u);
assert.match(test, /server-authored source-facts tail cannot become implementation requirements/u);
assert.match(test, /excluded proposal heading cannot suppress the established modal fallback/u);
assert.match(test, /Story-to-Task edit preserves immutable implementation identity/u);
console.log('DELIVERY NUMBERED REQUIREMENTS STATIC PASS contextual extraction, client/server parity, source-facts boundary, identity convergence and edit identity');

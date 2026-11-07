import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createLegacyDeliveryPostgresFixture } from './legacyDeliveryPostgresFixture.mjs';

if (!process.env.LEGACY_DELIVERY_ACCEPTANCE_DATABASE_URL) {
  if (process.env.CI) throw new Error('LEGACY_DELIVERY_ACCEPTANCE_DATABASE_URL is required in CI.');
  console.log('LEGACY_DELIVERY_ACCEPTANCE_DATABASE_URL not set; stable proposal PostgreSQL test was not run.');
  process.exit(0);
}

const fixture = await createLegacyDeliveryPostgresFixture({
  throughMigration: '20261103104435_delivery_requirement_bound_proposals.sql', seed: false,
});
try {
  const bindingId = randomUUID();
  const artifactId = randomUUID();
  const origin = `sha256:${'a'.repeat(64)}`;
  const links = [{ sectionId: 'requirements', sectionTitle: 'Requirements', requirementText: 'FR-1: Board must retain the approved source.' }];
  await fixture.db.query("SET session_replication_role='replica'");
  try {
    await fixture.db.query(`INSERT INTO public.studio_delivery_work_item_requirement_bindings(
      id,org_id,workspace_id,project_id,publication_id,document_generation_id,studio_artifact_id,
      studio_artifact_version_id,studio_artifact_version,source_item_index,proposal_origin_id,requirement_links)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,0,$9,$10::jsonb)`, [
      bindingId, randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), artifactId, randomUUID(), origin, JSON.stringify(links),
    ]);
  } finally {
    await fixture.db.query("SET session_replication_role='origin'");
  }

  await fixture.db.query(await readFile('supabase/migrations/20261103170101_stable_requirement_proposal_identity.sql', 'utf8'));
  const retained = (await fixture.db.query(`SELECT proposal_origin_id,proposal_role,requirement_links
    FROM public.studio_delivery_work_item_requirement_bindings WHERE id=$1`, [bindingId])).rows[0];
  assert.deepEqual(retained, { proposal_origin_id: origin, proposal_role: 'legacy', requirement_links: links });
  await assert.rejects(
    fixture.db.query('UPDATE public.studio_delivery_work_item_requirement_bindings SET proposal_role=$2 WHERE id=$1', [bindingId, 'implementation']),
    /LEGACY_DELIVERY_IMMUTABLE/,
  );

  const result = (await fixture.db.query(`SELECT
    public.studio_delivery_stable_proposal_origin($1,'implementation',$2::jsonb) implementation_story,
    public.studio_delivery_stable_proposal_origin($1,'implementation',$2::jsonb) implementation_task,
    public.studio_delivery_stable_proposal_origin($1,'verification',$2::jsonb) verification,
    public.studio_delivery_proposal_origin($1,'Story',$2::jsonb) historical_story,
    public.studio_delivery_proposal_origin($1,'Task',$2::jsonb) historical_task`,
  [artifactId, JSON.stringify(links)])).rows[0];
  assert.equal(result.implementation_story, result.implementation_task);
  assert.notEqual(result.implementation_story, result.verification);
  assert.equal(result.implementation_story, result.historical_story,
    'implementation retains the pre-upgrade generated Story origin domain');
  assert.equal(result.verification, result.historical_task,
    'verification retains the pre-upgrade generated Task origin domain');
  console.log('Stable proposal PostgreSQL: populated upgrade preserved, type edit stable, role separation and immutable history passed.');
} finally {
  await fixture.close();
}

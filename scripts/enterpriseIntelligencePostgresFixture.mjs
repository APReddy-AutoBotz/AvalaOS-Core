import assert from 'node:assert/strict';
import {createApprovedStudioFixture} from './studioPrivateArtifactPostgresFixture.mjs';

const uuid = number => `99000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const hash = character => character.repeat(64);

export async function createEnterpriseIntelligenceFixture(db) {
  const studio = await createApprovedStudioFixture(db);
  const enterpriseCapabilities = [
    'byok.manage', 'security.manage',
    'evidence.write', 'evidence.review', 'assessment.edit', 'approvals.review',
    'docs.approve', 'project.manage', 'project.read', 'monitor.manage',
    'monitor.read', 'portfolio.manage', 'assemble.manage',
  ];
  await db.query(
    `INSERT INTO public.role_capabilities(role_id, capability_key)
     SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`,
    [studio.role, enterpriseCapabilities],
  );
  const routeRole = uuid(3);
  await db.query(
    `INSERT INTO public.roles(id,org_id,workspace_id,name,slug,scope,permissions,status,created_by)
     VALUES($1,$2,$3,'Enterprise route reviewer','enterprise-route-reviewer','workspace','[]','active',$4)`,
    [routeRole, studio.org, studio.workspace, studio.requester],
  );
  await db.query(
    `UPDATE public.workspace_memberships SET role_id=$1
     WHERE org_id=$2 AND workspace_id=$3 AND user_id=$4 AND status='active' AND deleted_at IS NULL`,
    [routeRole, studio.org, studio.workspace, studio.requester],
  );

  const keyRef = uuid(1);
  const provider = uuid(2);
  await db.query(
    `INSERT INTO public.ai_provider_key_refs(id, org_id, provider, resolver_type, secret_ref, safe_label, status, created_by)
     VALUES($1,$2,'openai','server_reference','fixture/provider/reference','Fixture reference','active',$3)`,
    [keyRef, studio.org, studio.requester],
  );
  await db.query(
    `INSERT INTO public.ai_provider_configs(
       id, org_id, provider, display_name, key_ref_id, default_model, model_allowlist,
       allowed_modes, allowed_operations, status, created_by, updated_by
     ) VALUES($1,$2,'openai','Fixture provider',$3,'fixture-model',ARRAY['fixture-model'],
       ARRAY['pilot'],ARRAY['generate_document'],'active',$4,$4)`,
    [provider, studio.org, keyRef, studio.requester],
  );

  const formats = [
    ['text/plain', 'txt', true],
    ['text/markdown', 'md', true],
    ['text/csv', 'csv', true],
    ['text/vtt', 'vtt', true],
    ['application/x-subrip', 'srt', true],
    ['application/pdf', 'pdf', true],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx', true],
    ['application/pdf', 'scanned.pdf', false],
  ];
  const sources = [];
  for (let index = 0; index < formats.length; index += 1) {
    const [mimeType, extension, parsed] = formats[index];
    const sourceId = uuid(100 + index * 2);
    const sourceVersionId = uuid(101 + index * 2);
    const source = {
      id: sourceId,
      org_id: studio.org,
      workspace_id: studio.workspace,
      display_name: `Fixture ${extension}`,
      source_kind: 'upload',
      mime_type: mimeType,
      created_by: studio.requester,
    };
    const version = {
      id: sourceVersionId,
      source_id: sourceId,
      org_id: studio.org,
      workspace_id: studio.workspace,
      original_filename: `fixture.${extension}`,
      content_hash: hash('12345678'[index]),
      content_bytes: 128 + index,
      storage_bucket: 'source-uploads',
      storage_path: `${studio.org}/${studio.workspace}/enterprise-evidence/${sourceId}.bin`,
      extracted_text_hash: parsed ? hash(String(((index + 2) % 6) + 1)) : null,
      extracted_character_count: parsed ? 48 + index : null,
      created_by: studio.requester,
    };
    const result = (await db.query(
      'SELECT public.enterprise_create_evidence_source($1::jsonb,$2::jsonb) result',
      [JSON.stringify(source), JSON.stringify(version)],
    )).rows[0].result;
    assert.equal(result.sourceId, sourceId);
    sources.push({sourceId, sourceVersionId, mimeType, extension, parsed, result});
  }

  const parsedSource = sources[0];
  const job = uuid(200);
  const candidate = uuid(201);
  await db.query(
    `INSERT INTO public.enterprise_ai_job_ledger(
       id,org_id,workspace_id,capability,provider_config_id,provider,model,prompt_key,
       prompt_version,actor_id,request_id,idempotency_key,status,approval_state
     ) VALUES($1,$2,$3,'assess.evidence.extract',$4,'openai','fixture-model','fixture-extract',
       'fixture-1',$5,$6,'fixture-extraction-001','running','review_required')`,
    [job, studio.org, studio.workspace, provider, studio.requester, uuid(202)],
  );
  await db.query(
    `SELECT public.enterprise_commit_evidence_extraction(
       $1,$2,$3,$4,$5,10,$6,'openai','fixture-model',20,10,$7::jsonb)`,
    [job, parsedSource.sourceId, studio.org, studio.workspace, hash('a'), provider, JSON.stringify([{
      id: candidate,
      sourceVersionId: parsedSource.sourceVersionId,
      field: 'process_objective',
      value: 'Govern the fixture process',
      safeExcerpt: 'Govern the fixture process with independently reviewed evidence.',
      sourceLocator: 'line:1-1',
      confidence: 0.95,
      promptVersion: 'fixture-1',
      createdBy: studio.requester,
    }])],
  );

  return { ...studio, routeRole, keyRef, provider, sources, job, candidate, uuid, hash };
}

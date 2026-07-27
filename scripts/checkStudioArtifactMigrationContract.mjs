import fs from 'node:fs';
const path='supabase/migrations/20260727120000_studio_governed_artifact_authority.sql';
const sql=fs.readFileSync(path,'utf8');
const required=[
 'studio_artifact_aggregates','studio_artifact_versions','studio_system_template_versions','studio_artifact_generation_attempts',
 'studio_artifact_review_assignments','studio_artifact_review_resolutions','studio_artifact_approval_resolutions','studio_artifact_command_receipts',
 'UNIQUE(org_id,workspace_id,handoff_id,artifact_type)','studio_current_approved_version_fk','studio.artifacts.read','studio.artifacts.generate',
 'studio.artifacts.edit','studio.artifacts.review','studio.artifacts.approve','ENABLE ROW LEVEL SECURITY','FORCE ROW LEVEL SECURITY',
 'studio_artifact_command_claim','studio_artifact_generation_complete','studio_artifact_generation_fail','studio_artifact_authority',
 'STUDIO_SEPARATION_OF_DUTY','STUDIO_IDEMPOTENCY_CONFLICT','source_package_hash','review_schema_version','review_sequence',
 'studio_one_active_generation_attempt','studio_artifact_generation_start','studio_artifact_eligible_reviewers',
 "'id',a.id,'artifactType'","'currentApprovedVersion',cav.dto","'versions',COALESCE(vs.items","'readOnly',NOT ctl.enabled OR ctl.read_only",
 "p_payload->>'parentVersionId'","p_payload->>'artifactVersionId'",'a.created_by=p_actor_id',
 "'ok',true,'outcome','generation_completed'","'ok',true,'outcome','generation_failed'",
 "COMMENT ON TABLE public.document_generations IS 'Legacy/unverified only",
];
const missing=required.filter(token=>!sql.includes(token));
if(missing.length){console.error(`Studio artifact migration contract missing: ${missing.join(', ')}`);process.exit(1)}
const authority=sql.indexOf('PERFORM public.studio_assert_actor');
const receipt=sql.indexOf("studio_claim_receipt('studio.artifact.generation.request");
if(authority<0||receipt<0||authority>receipt){console.error('Authorization must precede receipt inspection');process.exit(1)}
if(/CREATE (?:OR REPLACE )?TABLE public\.document_generations|ALTER TABLE public\.document_generations/.test(sql)){console.error('Legacy document_generations structure was modified');process.exit(1)}
const finalAuthorityAcl=sql.lastIndexOf('REVOKE ALL ON FUNCTION public.studio_artifact_authority(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role');
const unsafeAuthorityGrant=sql.lastIndexOf('GRANT EXECUTE ON FUNCTION public.studio_artifact_authority(uuid,uuid,uuid),public.studio_artifact_handoffs');
if(finalAuthorityAcl<unsafeAuthorityGrant){console.error('Actor authority RPC must finish service-role-only');process.exit(1)}
if(!sql.includes("p_command->'expectedArtifactVersion' IS DISTINCT FROM 'null'::jsonb")||!sql.includes('p_expected_version IS NULL')){console.error('Expected-version null semantics missing');process.exit(1)}
for(const excluded of ['storage.objects','signed_url','legal_hold','retention_until'])if(sql.toLowerCase().includes(excluded)){console.error(`Excluded PR B authority found: ${excluded}`);process.exit(1)}
console.log(`Studio artifact migration contract: ${required.length+5} authority, ancestry, ACL, lifecycle, and legacy assertions passed.`);

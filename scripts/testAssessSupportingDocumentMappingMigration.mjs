import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const path='supabase/migrations/20260916083814_assess_supporting_document_mapping.sql';
const sql=await readFile(path,'utf8');
const check=(name,test)=>{assert.ok(test,name);console.log(`ASSESS_DOCUMENT_MAPPING_ASSERTION ${JSON.stringify({testId:name,result:'passed',source:path})}`)};

check('MAP-MIG-001-default-off',/assess_document_mapping_enabled boolean NOT NULL DEFAULT false/.test(sql));
check('MAP-MIG-002-xlsx-bounded',sql.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')&&sql.includes("'xlsx'"));
check('MAP-MIG-003-command-classification',['assess.document-map.analyze','assess.document-map.proposal.review','assess.document-map.preview','assess.document-map.conflict.resolve','assess.document-map.commit'].every(value=>sql.includes(value)));
check('MAP-MIG-004-conjunctive-authority',['assess.v2.read','assess.v2.draft.write','evidence.write','evidence.review','transcript.assess.apply'].every(value=>sql.includes(value)));
check('MAP-MIG-005-exact-lineage',['sourceSetId','sourceSetVersionId','expectedSourceSetVersion','sourceId','sourceVersionId','input_bundle_version_id','extraction_binding_id','extraction_job_id'].every(value=>sql.includes(value)));
check('MAP-MIG-006-provider-byte-cap',sql.includes('byte_total>120000')&&sql.includes('extracted_byte_count BETWEEN 1 AND 120000'));
check('MAP-MIG-007-db-authoritative-hashes',sql.includes("computed:=public.enterprise_sha256_jsonb")&&sql.includes("public.enterprise_sha256_jsonb(current)")&&!sql.includes("computed IS DISTINCT FROM p_catalog_hash"));
check('MAP-MIG-008-zero-proposals',sql.includes('jsonb_array_length(p_proposals) NOT BETWEEN 0 AND 100'));
check('MAP-MIG-009-human-review',sql.includes('enterprise_assess_document_mapping_reviews')&&sql.includes("status IN('accepted','edited','rejected')"));
check('MAP-MIG-010-manual-and-cross-source-conflicts',sql.includes("kind IN('manual','cross_source')")&&sql.includes("'retain_manual'")&&sql.includes("'authored_resolution'"));
check('MAP-MIG-011-one-version-atomic',sql.includes('c.version+1')&&sql.includes('oldv.source_snapshot,oldv.imported_facts')&&sql.includes('ENTERPRISE_ASSESS_DOCUMENT_MAPPING_NATIVE_SHAPE_INVALID'));
check('MAP-MIG-012-fact-provenance-preserved',sql.includes('enterprise_assess_document_merge_fact')&&sql.includes("COALESCE(p_old->'evidenceIds'")&&sql.includes("COALESCE(p_old->>'source','system')")&&sql.includes('enterprise_assess_document_fact_key'));
check('MAP-MIG-013-server-constructors',sql.includes('new_id uuid:=gen_random_uuid()')&&sql.includes("'strategicLifespan','unknown'")&&sql.includes("'highImpact',p_value->'highImpact'")&&sql.includes("'resolutionPrimitiveIds','[]'::jsonb"));
check('MAP-MIG-014-legacy-bypass-closed',sql.includes('ENTERPRISE_TRANSCRIPT_TYPED_MAPPING_REQUIRED')&&sql.includes("p.application_intent='set_case_field'")&&sql.includes("p.application_intent='link_evidence_only'")&&sql.includes("p.proposed_value='{}'::jsonb"));
check('MAP-MIG-015-service-only-writes',sql.includes('FORCE ROW LEVEL SECURITY')&&sql.includes('FROM PUBLIC,anon,authenticated')&&sql.includes('TO service_role'));
check('MAP-MIG-016-no-generic-candidate-dependency',!sql.includes('REFERENCES public.enterprise_evidence_candidates')&&!sql.includes('candidate.ai_job_id'));
check('MAP-MIG-017-no-automatic-role-grant',!sql.includes('INSERT INTO public.role_capabilities'));
check('MAP-MIG-018-rollback-preserves-history',sql.includes('Rollback is feature disablement/read-only use'));
check('MAP-MIG-019-native-bounds',sql.includes("length(btrim(p_value->>'name')) BETWEEN 1 AND 200")&&sql.includes("length(p_value->>'trigger')<=500")&&sql.includes("length(btrim(p_value->>'ruleDescription')) BETWEEN 1 AND 2000"));
check('MAP-MIG-020-empty-and-bare-facts',sql.includes("fact_key IS NULL THEN 'null'::jsonb")&&sql.includes("replace(p_field,'primitive.','')")&&sql.includes("'status',CASE WHEN jsonb_typeof(p_value)='null' THEN 'unknown' ELSE 'suggested' END"));
check('MAP-MIG-021-legacy-conjunctive-authority',sql.match(/pr1b_assert_command_authority\(p_actor,p_org,p_workspace,'assess\.v2\.read'/g)?.length===2&&sql.match(/pr1b_assert_command_authority\(p_actor,p_org,p_workspace,'assess\.v2\.draft\.write'/g)?.length===2);
check('MAP-MIG-022-terminal-failure-contract',sql.includes('enterprise_fail_assess_document_mapping_run_v1')&&sql.includes("failure IS NULL OR (failure=ANY(ARRAY['BUDGET_EXHAUSTED'")&&sql.includes("terminal:=CASE failure WHEN 'BUDGET_EXHAUSTED' THEN 'blocked' ELSE 'failed' END")&&sql.includes('public.enterprise_ai_effect_journal')===false);
check('MAP-MIG-023-exact-run-recovery',sql.includes("recovery:='execute_provider'")&&sql.includes("recovery:='finalize_staged'")&&sql.includes("run.claim_binding_hash IS DISTINCT FROM claim_binding")&&sql.includes("'targets',persisted_targets,'sourceBindings',bindings"));
check('MAP-MIG-024-source-freshness-lock',sql.includes('enterprise_assess_document_mapping_lock_source_set_root')&&sql.includes('BEFORE INSERT ON public.enterprise_source_set_versions')&&sql.includes('enterprise_assess_document_mapping_assert_run_fresh')&&sql.includes('FOR SHARE OF root,version'));
check('MAP-MIG-025-versioned-complete-preview',sql.includes('PRIMARY KEY(preview_batch_id,manifest_version)')&&sql.includes('unresolved_conflict_count')&&sql.includes('resolution_set_hash')&&sql.includes('item_bindings jsonb')&&sql.includes('conflict_bindings jsonb')&&sql.includes('resolution_bindings jsonb'));
check('MAP-MIG-026-exact-latest-manifest-commit',sql.includes('ORDER BY manifest_version DESC LIMIT 1 FOR SHARE')&&sql.includes("manifest_row.manifest IS DISTINCT FROM p_preview_manifest")&&sql.includes('preview_manifest_json(batch.id,manifest_row.manifest_version)'));
check('MAP-MIG-027-canonical-fact-aliases',sql.includes('enterprise_assess_document_normalize_primitive_facts')&&sql.includes('ENTERPRISE_ASSESS_DOCUMENT_MAPPING_FACT_ALIAS_CONFLICT')&&sql.includes("fact:=jsonb_set(fact,'{fieldId}',to_jsonb(canonical),true)"));
check('MAP-MIG-028-stage-completeness',sql.includes("'targetCount','sourceCount'")&&sql.includes("(p_result->>'targetCount')::integer IS DISTINCT FROM")&&sql.includes("(p_result->>'sourceCount')::integer IS DISTINCT FROM"));

console.log('Assess supporting-document mapping migration contract: 28/28 passed.');

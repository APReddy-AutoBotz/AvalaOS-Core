-- Trust Assurance Evidence Hub. Additive source authority; no readiness claim or tenant seed data.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
INSERT INTO public.capabilities(capability_key,module,description) VALUES
 ('trust.read','trust','Read scoped Trust Assurance projections'),('trust.manage','trust','Manage claims, evidence, links and snapshots'),
 ('trust.review','trust','Independently review exact Trust Assurance versions'),('trust.publish','trust','Publish or withdraw reviewed assurance snapshots')
ON CONFLICT(capability_key) DO UPDATE SET module=excluded.module,description=excluded.description;

CREATE TABLE public.trust_claims(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 workspace_id uuid, owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 readiness_domain text NOT NULL CHECK(readiness_domain IN('security','tenant_isolation','ai_controls','evidence','export','deployment','operations','buyer_readiness','product_readiness','release_candidate')),
 current_version_id uuid, lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN('draft','under_review','changes_requested','reviewed','approved','published','withdrawn')),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,org_id,workspace_id), FOREIGN KEY(workspace_id,org_id) REFERENCES public.workspaces(id,org_id) ON DELETE RESTRICT);
CREATE TABLE public.trust_claim_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), claim_id uuid NOT NULL REFERENCES public.trust_claims(id) ON DELETE RESTRICT,
 org_id uuid NOT NULL, workspace_id uuid, version bigint NOT NULL CHECK(version>0), claim_text text NOT NULL CHECK(length(btrim(claim_text)) BETWEEN 1 AND 4000),
 proposed_proof_status text NOT NULL CHECK(proposed_proof_status IN('demo','planned','configured','evidence_required','verified','blocked')),
 proof_boundary text NOT NULL CHECK(proof_boundary IN('docs_only','synthetic_only','local_unproven','hosted_unproven','verified_with_evidence','blocked_until_ap_approval')),
 buyer_safe_wording text NOT NULL CHECK(length(btrim(buyer_safe_wording)) BETWEEN 1 AND 2000), limitation_disclosure text NOT NULL CHECK(length(limitation_disclosure)<=4000),
 does_not_prove jsonb NOT NULL CHECK(jsonb_typeof(does_not_prove)='array' AND jsonb_array_length(does_not_prove)>0), canonical_hash text NOT NULL CHECK(canonical_hash~'^[0-9a-f]{64}$'),
 created_by uuid NOT NULL REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now(), supersedes_version_id uuid REFERENCES public.trust_claim_versions(id) ON DELETE RESTRICT,
 UNIQUE(claim_id,version), UNIQUE(id,org_id,workspace_id), UNIQUE(claim_id,canonical_hash), FOREIGN KEY(claim_id,org_id,workspace_id) REFERENCES public.trust_claims(id,org_id,workspace_id) ON DELETE RESTRICT);
ALTER TABLE public.trust_claims ADD CONSTRAINT trust_claim_current_version_fk FOREIGN KEY(current_version_id,org_id,workspace_id) REFERENCES public.trust_claim_versions(id,org_id,workspace_id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.trust_evidence(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT, workspace_id uuid,
 owner_id uuid NOT NULL REFERENCES public.profiles(id), evidence_type text NOT NULL CHECK(length(btrim(evidence_type)) BETWEEN 1 AND 80), current_version_id uuid,
 lifecycle text NOT NULL DEFAULT 'active' CHECK(lifecycle IN('active','superseded','withdrawn','blocked','not_run')), version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,org_id,workspace_id),FOREIGN KEY(workspace_id,org_id) REFERENCES public.workspaces(id,org_id) ON DELETE RESTRICT);
CREATE TABLE public.trust_evidence_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),evidence_id uuid NOT NULL REFERENCES public.trust_evidence(id) ON DELETE RESTRICT,org_id uuid NOT NULL,workspace_id uuid,version bigint NOT NULL CHECK(version>0),
 reference_type text NOT NULL CHECK(reference_type IN('repository_path','workflow_run','test_report','attestation','other')),reference_value text NOT NULL CHECK(length(btrim(reference_value)) BETWEEN 1 AND 512 AND reference_value!~*'(token=|signature=|/storage/v1/object/)'),
 digest text CHECK(digest IS NULL OR digest~'^[0-9a-f]{64}$'),summary text NOT NULL CHECK(length(btrim(summary)) BETWEEN 1 AND 2000),
 evidence_boundary text NOT NULL CHECK(evidence_boundary IN('docs_only','synthetic_only','local_unproven','hosted_unproven','verified_with_evidence','blocked_until_ap_approval')),
 result text NOT NULL CHECK(result IN('performed','blocked','not_run')),observed_at timestamptz,review_due_at timestamptz,expires_at timestamptz,
 lifecycle text NOT NULL CHECK(lifecycle IN('active','superseded','withdrawn','blocked','not_run')),canonical_hash text NOT NULL CHECK(canonical_hash~'^[0-9a-f]{64}$'),
 created_by uuid NOT NULL REFERENCES public.profiles(id),created_at timestamptz NOT NULL DEFAULT now(),supersedes_version_id uuid REFERENCES public.trust_evidence_versions(id) ON DELETE RESTRICT,
 UNIQUE(evidence_id,version),UNIQUE(id,org_id,workspace_id),UNIQUE(evidence_id,canonical_hash),FOREIGN KEY(evidence_id,org_id,workspace_id) REFERENCES public.trust_evidence(id,org_id,workspace_id) ON DELETE RESTRICT,
 CHECK((result='performed' AND observed_at IS NOT NULL) OR result IN('blocked','not_run')));
ALTER TABLE public.trust_evidence ADD CONSTRAINT trust_evidence_current_version_fk FOREIGN KEY(current_version_id,org_id,workspace_id) REFERENCES public.trust_evidence_versions(id,org_id,workspace_id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.trust_claim_evidence_links(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,workspace_id uuid,claim_version_id uuid NOT NULL,evidence_version_id uuid NOT NULL,
 relationship text NOT NULL CHECK(relationship IN('supports','contradicts','limits')),rationale text NOT NULL CHECK(length(btrim(rationale)) BETWEEN 1 AND 2000),canonical_hash text NOT NULL CHECK(canonical_hash~'^[0-9a-f]{64}$'),
 created_by uuid NOT NULL REFERENCES public.profiles(id),created_at timestamptz NOT NULL DEFAULT now(),supersedes_link_id uuid REFERENCES public.trust_claim_evidence_links(id) ON DELETE RESTRICT,
 UNIQUE(claim_version_id,evidence_version_id,relationship,canonical_hash),UNIQUE(id,org_id,workspace_id),FOREIGN KEY(claim_version_id,org_id,workspace_id) REFERENCES public.trust_claim_versions(id,org_id,workspace_id) ON DELETE RESTRICT,
 FOREIGN KEY(evidence_version_id,org_id,workspace_id) REFERENCES public.trust_evidence_versions(id,org_id,workspace_id) ON DELETE RESTRICT);
CREATE TABLE public.trust_review_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL REFERENCES public.organizations(id),workspace_id uuid,resource_type text NOT NULL CHECK(resource_type IN('claim_version','evidence_version','snapshot')),
 resource_id uuid NOT NULL,resource_hash text NOT NULL CHECK(resource_hash~'^[0-9a-f]{64}$'),reviewer_id uuid NOT NULL REFERENCES public.profiles(id),decision text NOT NULL CHECK(decision IN('changes_requested','reviewed','approved')),
 rationale text NOT NULL CHECK(length(btrim(rationale)) BETWEEN 1 AND 2000),authorization_version bigint NOT NULL CHECK(authorization_version>0),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,org_id) REFERENCES public.workspaces(id,org_id) ON DELETE RESTRICT);
CREATE TABLE public.trust_snapshots(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL REFERENCES public.organizations(id),workspace_id uuid,selection jsonb NOT NULL CHECK(jsonb_typeof(selection)='object'),canonical_hash text NOT NULL CHECK(canonical_hash~'^[0-9a-f]{64}$'),
 lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN('draft','under_review','changes_requested','reviewed','approved','published','withdrawn')),creator_id uuid NOT NULL REFERENCES public.profiles(id),version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 reviewed_by uuid REFERENCES public.profiles(id),reviewed_hash text CHECK(reviewed_hash IS NULL OR reviewed_hash~'^[0-9a-f]{64}$'),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,org_id,workspace_id),UNIQUE(org_id,workspace_id,canonical_hash),FOREIGN KEY(workspace_id,org_id) REFERENCES public.workspaces(id,org_id) ON DELETE RESTRICT,CHECK(reviewed_by IS NULL OR reviewed_by<>creator_id));
CREATE TABLE public.trust_publication_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,workspace_id uuid,snapshot_id uuid NOT NULL,snapshot_hash text NOT NULL CHECK(snapshot_hash~'^[0-9a-f]{64}$'),
 event_type text NOT NULL CHECK(event_type IN('published','withdrawn','superseded')),publisher_id uuid NOT NULL REFERENCES public.profiles(id),supersedes_publication_id uuid REFERENCES public.trust_publication_events(id) ON DELETE RESTRICT,
 is_current boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,org_id,workspace_id),FOREIGN KEY(snapshot_id,org_id,workspace_id) REFERENCES public.trust_snapshots(id,org_id,workspace_id) ON DELETE RESTRICT);
CREATE UNIQUE INDEX trust_one_current_publication ON public.trust_publication_events(org_id,COALESCE(workspace_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE is_current;
CREATE TABLE public.trust_current_publications(org_id uuid NOT NULL REFERENCES public.organizations(id),workspace_scope uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',publication_id uuid NOT NULL REFERENCES public.trust_publication_events(id),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(org_id,workspace_scope));
CREATE TABLE public.trust_command_receipts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL REFERENCES public.organizations(id),workspace_id uuid,actor_id uuid NOT NULL REFERENCES public.profiles(id),operation text NOT NULL,
 idempotency_key text NOT NULL CHECK(length(btrim(idempotency_key)) BETWEEN 1 AND 200),request_id uuid NOT NULL,request_hash text NOT NULL CHECK(request_hash~'^[0-9a-f]{64}$'),status text NOT NULL CHECK(status='committed'),
 http_status integer NOT NULL CHECK(http_status BETWEEN 200 AND 499),response_body jsonb NOT NULL CHECK(jsonb_typeof(response_body)='object'),resource_id uuid NOT NULL,resource_version bigint NOT NULL CHECK(resource_version>0),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,actor_id,operation,idempotency_key),FOREIGN KEY(workspace_id,org_id) REFERENCES public.workspaces(id,org_id) ON DELETE RESTRICT);
CREATE TABLE public.trust_audit_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL REFERENCES public.organizations(id),workspace_id uuid,actor_id uuid NOT NULL REFERENCES public.profiles(id),action text NOT NULL,resource_type text NOT NULL,resource_id uuid NOT NULL,
 resource_version bigint NOT NULL CHECK(resource_version>0),result text NOT NULL CHECK(result IN('committed','denied')),request_id uuid NOT NULL,receipt_id uuid REFERENCES public.trust_command_receipts(id),metadata jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(metadata)='object' AND pg_column_size(metadata)<=4096),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,org_id) REFERENCES public.workspaces(id,org_id) ON DELETE RESTRICT);

CREATE FUNCTION public.trust_assurance_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'TRUST_ASSURANCE_IMMUTABLE'; END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['trust_claim_versions','trust_evidence_versions','trust_claim_evidence_links','trust_review_events','trust_publication_events','trust_command_receipts','trust_audit_events'] LOOP EXECUTE format('CREATE TRIGGER %I_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.trust_assurance_immutable()',t,t); END LOOP; END $$;

-- Canonical tables are service-owned. Query access is only through scoped SECURITY DEFINER functions added below.
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['trust_claims','trust_claim_versions','trust_evidence','trust_evidence_versions','trust_claim_evidence_links','trust_review_events','trust_snapshots','trust_publication_events','trust_current_publications','trust_command_receipts','trust_audit_events'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t); END LOOP; END $$;
REVOKE ALL ON FUNCTION public.trust_assurance_immutable() FROM PUBLIC,anon,authenticated;

-- Mutation dispatcher remains private; every operation is validated and committed by one transaction.
CREATE FUNCTION public.trust_assurance_command(p_actor_id uuid,p_org_id uuid,p_workspace_id uuid,p_operation text,p_idempotency_key text,p_request_id uuid,p_request_hash text,p_authorization_version bigint,p_expected_version bigint,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.trust_command_receipts; actual bigint; cap text; BEGIN
 IF p_operation NOT IN('claim.create','claim.revise','evidence.register','evidence.supersede','evidence.withdraw','evidence.link','resource.review','snapshot.create','snapshot.review','snapshot.publish','snapshot.withdraw') OR jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'ACCESS_DENIED'; END IF;
 cap:=CASE WHEN p_operation IN('resource.review','snapshot.review') THEN 'trust.review' WHEN p_operation IN('snapshot.publish','snapshot.withdraw') THEN 'trust.publish' ELSE 'trust.manage' END;
 PERFORM public.pr1b_assert_command_authority(p_actor_id,p_org_id,p_workspace_id,cap,p_authorization_version);
 SELECT * INTO r FROM public.trust_command_receipts WHERE org_id=p_org_id AND actor_id=p_actor_id AND operation=p_operation AND idempotency_key=p_idempotency_key FOR UPDATE;
 IF FOUND THEN IF r.request_hash<>p_request_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF; RETURN r.response_body; END IF;
 -- Feature-owned typed Edge layer supplies canonical validated payload. Operation-specific state transitions are deliberately explicit.
 IF p_operation='snapshot.publish' THEN
   SELECT version INTO actual FROM public.trust_snapshots WHERE id=(p_payload->>'snapshotId')::uuid AND org_id=p_org_id AND workspace_id IS NOT DISTINCT FROM p_workspace_id FOR UPDATE;
   IF actual IS NULL OR actual<>p_expected_version THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
   IF EXISTS(SELECT 1 FROM public.trust_snapshots s WHERE s.id=(p_payload->>'snapshotId')::uuid AND (s.lifecycle<>'reviewed' OR s.reviewed_hash IS DISTINCT FROM s.canonical_hash OR s.creator_id=p_actor_id OR s.reviewed_by=p_actor_id)) THEN RAISE EXCEPTION 'PUBLICATION_BLOCKED'; END IF;
   INSERT INTO public.trust_publication_events(org_id,workspace_id,snapshot_id,snapshot_hash,event_type,publisher_id,is_current) SELECT p_org_id,p_workspace_id,s.id,s.canonical_hash,'published',p_actor_id,false FROM public.trust_snapshots s WHERE s.id=(p_payload->>'snapshotId')::uuid RETURNING id INTO r.id;
   INSERT INTO public.trust_current_publications(org_id,workspace_scope,publication_id) VALUES(p_org_id,COALESCE(p_workspace_id,'00000000-0000-0000-0000-000000000000'),r.id) ON CONFLICT(org_id,workspace_scope) DO UPDATE SET publication_id=excluded.publication_id,updated_at=now();
   UPDATE public.trust_snapshots SET lifecycle='published',version=version+1,updated_at=now() WHERE id=(p_payload->>'snapshotId')::uuid RETURNING version INTO actual;
 ELSIF p_operation='snapshot.create' THEN
   INSERT INTO public.trust_snapshots(org_id,workspace_id,selection,canonical_hash,creator_id) VALUES(p_org_id,p_workspace_id,p_payload->'selection',p_payload->>'canonicalHash',p_actor_id) RETURNING id,version INTO r.resource_id,actual;
 ELSIF p_operation='snapshot.review' THEN
   UPDATE public.trust_snapshots SET lifecycle=CASE WHEN p_payload->>'decision'='changes_requested' THEN 'changes_requested' ELSE 'reviewed' END,reviewed_by=p_actor_id,reviewed_hash=canonical_hash,version=version+1,updated_at=now() WHERE id=(p_payload->>'snapshotId')::uuid AND org_id=p_org_id AND workspace_id IS NOT DISTINCT FROM p_workspace_id AND creator_id<>p_actor_id AND version=p_expected_version RETURNING id,version INTO r.resource_id,actual;
   IF actual IS NULL THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
   INSERT INTO public.trust_review_events(org_id,workspace_id,resource_type,resource_id,resource_hash,reviewer_id,decision,rationale,authorization_version) SELECT p_org_id,p_workspace_id,'snapshot',s.id,s.canonical_hash,p_actor_id,p_payload->>'decision',p_payload->>'rationale',p_authorization_version FROM public.trust_snapshots s WHERE s.id=r.resource_id;
 ELSIF p_operation='claim.create' THEN
   INSERT INTO public.trust_claims(org_id,workspace_id,owner_id,readiness_domain) VALUES(p_org_id,p_workspace_id,p_actor_id,p_payload->>'readinessDomain') RETURNING id,version INTO r.resource_id,actual;
   INSERT INTO public.trust_claim_versions(claim_id,org_id,workspace_id,version,claim_text,proposed_proof_status,proof_boundary,buyer_safe_wording,limitation_disclosure,does_not_prove,canonical_hash,created_by) VALUES(r.resource_id,p_org_id,p_workspace_id,1,p_payload->>'claimText',p_payload->>'proposedProofStatus',p_payload->>'proofBoundary',p_payload->>'buyerSafeWording',p_payload->>'limitationDisclosure',p_payload->'doesNotProve',p_payload->>'canonicalHash',p_actor_id) RETURNING id INTO r.id;
   UPDATE public.trust_claims SET current_version_id=r.id WHERE id=r.resource_id;
 ELSIF p_operation='claim.revise' THEN
   UPDATE public.trust_claims SET version=version+1,lifecycle='draft',updated_at=now() WHERE id=(p_payload->>'claimId')::uuid AND org_id=p_org_id AND workspace_id IS NOT DISTINCT FROM p_workspace_id AND version=p_expected_version RETURNING id,version,current_version_id INTO r.resource_id,actual,r.id;
   IF actual IS NULL THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
   INSERT INTO public.trust_claim_versions(claim_id,org_id,workspace_id,version,claim_text,proposed_proof_status,proof_boundary,buyer_safe_wording,limitation_disclosure,does_not_prove,canonical_hash,created_by,supersedes_version_id) VALUES(r.resource_id,p_org_id,p_workspace_id,actual,p_payload->>'claimText',p_payload->>'proposedProofStatus',p_payload->>'proofBoundary',p_payload->>'buyerSafeWording',p_payload->>'limitationDisclosure',p_payload->'doesNotProve',p_payload->>'canonicalHash',p_actor_id,r.id) RETURNING id INTO r.id;
   UPDATE public.trust_claims SET current_version_id=r.id WHERE id=r.resource_id;
 ELSIF p_operation='evidence.register' THEN
   INSERT INTO public.trust_evidence(org_id,workspace_id,owner_id,evidence_type,lifecycle) VALUES(p_org_id,p_workspace_id,p_actor_id,p_payload->>'evidenceType',COALESCE(p_payload->>'lifecycle','active')) RETURNING id,version INTO r.resource_id,actual;
   INSERT INTO public.trust_evidence_versions(evidence_id,org_id,workspace_id,version,reference_type,reference_value,digest,summary,evidence_boundary,result,observed_at,review_due_at,expires_at,lifecycle,canonical_hash,created_by) VALUES(r.resource_id,p_org_id,p_workspace_id,1,p_payload->>'referenceType',p_payload->>'referenceValue',p_payload->>'digest',p_payload->>'summary',p_payload->>'evidenceBoundary',p_payload->>'result',(p_payload->>'observedAt')::timestamptz,(p_payload->>'reviewDueAt')::timestamptz,(p_payload->>'expiresAt')::timestamptz,COALESCE(p_payload->>'lifecycle','active'),p_payload->>'canonicalHash',p_actor_id) RETURNING id INTO r.id;
   UPDATE public.trust_evidence SET current_version_id=r.id WHERE id=r.resource_id;
 ELSIF p_operation IN('evidence.supersede','evidence.withdraw') THEN
   UPDATE public.trust_evidence SET lifecycle=CASE WHEN p_operation='evidence.supersede' THEN 'superseded' ELSE 'withdrawn' END,version=version+1,updated_at=now() WHERE id=(p_payload->>'evidenceId')::uuid AND org_id=p_org_id AND workspace_id IS NOT DISTINCT FROM p_workspace_id AND version=p_expected_version RETURNING id,version INTO r.resource_id,actual;
   IF actual IS NULL THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
 ELSIF p_operation='evidence.link' THEN
   INSERT INTO public.trust_claim_evidence_links(org_id,workspace_id,claim_version_id,evidence_version_id,relationship,rationale,canonical_hash,created_by) VALUES(p_org_id,p_workspace_id,(p_payload->>'claimVersionId')::uuid,(p_payload->>'evidenceVersionId')::uuid,p_payload->>'relationship',p_payload->>'rationale',p_payload->>'canonicalHash',p_actor_id) RETURNING id INTO r.resource_id; actual:=1;
 ELSIF p_operation='resource.review' THEN
   INSERT INTO public.trust_review_events(org_id,workspace_id,resource_type,resource_id,resource_hash,reviewer_id,decision,rationale,authorization_version) VALUES(p_org_id,p_workspace_id,p_payload->>'resourceType',(p_payload->>'resourceId')::uuid,p_payload->>'resourceHash',p_actor_id,p_payload->>'decision',p_payload->>'rationale',p_authorization_version) RETURNING id INTO r.resource_id; actual:=1;
 ELSIF p_operation='snapshot.withdraw' THEN
   SELECT s.id,s.version INTO r.resource_id,actual FROM public.trust_snapshots s WHERE s.id=(p_payload->>'snapshotId')::uuid AND s.org_id=p_org_id AND s.workspace_id IS NOT DISTINCT FROM p_workspace_id AND s.lifecycle='published' FOR UPDATE;
   IF actual IS NULL THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
   INSERT INTO public.trust_publication_events(org_id,workspace_id,snapshot_id,snapshot_hash,event_type,publisher_id,is_current) SELECT p_org_id,p_workspace_id,s.id,s.canonical_hash,'withdrawn',p_actor_id,false FROM public.trust_snapshots s WHERE s.id=r.resource_id;
   DELETE FROM public.trust_current_publications WHERE org_id=p_org_id AND workspace_scope=COALESCE(p_workspace_id,'00000000-0000-0000-0000-000000000000'); UPDATE public.trust_snapshots SET lifecycle='withdrawn',version=version+1,updated_at=now() WHERE id=r.resource_id RETURNING version INTO actual;
 ELSE RAISE EXCEPTION 'VALIDATION_FAILED'; END IF;
 INSERT INTO public.trust_command_receipts(org_id,workspace_id,actor_id,operation,idempotency_key,request_id,request_hash,status,http_status,response_body,resource_id,resource_version)
 VALUES(p_org_id,p_workspace_id,p_actor_id,p_operation,p_idempotency_key,p_request_id,p_request_hash,'committed',200,jsonb_build_object('ok',true,'resourceId',COALESCE(r.resource_id,(p_payload->>'snapshotId')::uuid),'version',actual),COALESCE(r.resource_id,(p_payload->>'snapshotId')::uuid),actual) RETURNING * INTO r;
 INSERT INTO public.trust_audit_events(org_id,workspace_id,actor_id,action,resource_type,resource_id,resource_version,result,request_id,receipt_id) VALUES(p_org_id,p_workspace_id,p_actor_id,p_operation,split_part(p_operation,'.',1),COALESCE(r.resource_id,(p_payload->>'snapshotId')::uuid),actual,'committed',p_request_id,r.id);
 RETURN r.response_body;
END $$;
REVOKE ALL ON FUNCTION public.trust_assurance_command(uuid,uuid,uuid,text,text,uuid,text,bigint,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.trust_assurance_command(uuid,uuid,uuid,text,text,uuid,text,bigint,bigint,jsonb) TO service_role;

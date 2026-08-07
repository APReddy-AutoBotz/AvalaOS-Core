import { spawnSync } from 'node:child_process';import fs from 'node:fs';import path from 'node:path';
const url=process.env.DATABASE_URL;if(!url)throw new Error('DATABASE_URL required');
const run=(args,input)=>{const result=spawnSync('psql',[url,'-v','ON_ERROR_STOP=1','-X',...args],{input,encoding:'utf8'});if(result.status){process.stderr.write(result.stderr);process.exit(result.status??1)}return result.stdout};
for(const name of fs.readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql')).sort())run(['-f',path.resolve('supabase/migrations',name)]);
const assertion=`DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['trust_claims','trust_claim_versions','trust_evidence','trust_evidence_versions','trust_claim_evidence_links','trust_review_events','trust_snapshots','trust_publication_events','trust_current_publications','trust_command_receipts','trust_audit_events'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=t AND c.relrowsecurity AND c.relforcerowsecurity) THEN RAISE EXCEPTION 'RLS invariant failed: %',t; END IF;
  IF has_table_privilege('authenticated',format('public.%I',t),'INSERT,UPDATE,DELETE') OR has_table_privilege('anon',format('public.%I',t),'INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'ACL invariant failed: %',t; END IF;
 END LOOP;
 IF has_function_privilege('authenticated','public.trust_assurance_command(uuid,uuid,uuid,text,text,uuid,text,bigint,bigint,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'browser mutation authority'; END IF;
END $$;`;
run([],assertion);console.log('Trust Assurance PostgreSQL fresh-chain RLS/ACL invariants passed');

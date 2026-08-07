import fs from 'node:fs';
const candidates=fs.readdirSync('supabase/migrations').filter(name=>/^\d{14}_trust_assurance_evidence_hub\.sql$/.test(name));
if(candidates.length!==1)throw new Error(`Expected exactly one Trust Assurance migration, found ${candidates.length}`);
const file=`supabase/migrations/${candidates[0]}`;const sql=fs.readFileSync(file,'utf8');
const tables=['trust_claims','trust_claim_versions','trust_evidence','trust_evidence_versions','trust_claim_evidence_links','trust_review_events','trust_snapshots','trust_publication_events','trust_current_publications','trust_command_receipts','trust_audit_events'];
for(const table of tables){if(!sql.includes(`CREATE TABLE public.${table}`)||!sql.includes(`'${table}'`))throw new Error(`Missing governed table ${table}`)}
for(const token of ['FORCE ROW LEVEL SECURITY','SECURITY DEFINER','GRANT EXECUTE','TO service_role','IDEMPOTENCY_CONFLICT','VERSION_CONFLICT','PUBLICATION_BLOCKED','trust_assurance_immutable','trust_assurance_hash','trust_assurance_internal_projection','trust_assurance_buyer_projection','pg_advisory_xact_lock'])if(!sql.includes(token))throw new Error(`Missing migration contract ${token}`);
if(/INSERT INTO public\.trust_(claims|evidence|snapshots)[^;]+VALUES\s*\(\s*'[0-9a-f-]{36}'/is.test(sql))throw new Error('Tenant seed data prohibited');
console.log(`Trust Assurance migration contract passed (${tables.length} governed tables)`);

import fs from 'node:fs';
const candidates=fs.readdirSync('supabase/migrations').filter(name=>/^\d{14}_trust_assurance_evidence_hub\.sql$/.test(name));
if(candidates.length!==1){console.error(`Expected exactly one Trust Assurance migration, found ${candidates.length}`);process.exit(1)}
const migration=fs.readFileSync(`supabase/migrations/${candidates[0]}`,'utf8');
const required=['FORCE ROW LEVEL SECURITY','trust_assurance_immutable','trust_assurance_command','IDEMPOTENCY_CONFLICT','trust_one_current_publication','REVOKE ALL','service_role','trust_audit','trust_assurance_evidence_freshness','trust_assurance_effective_claim_law','trust-current-publication:','trust_assurance_internal_projection','trust_assurance_buyer_projection','pg_advisory_xact_lock'];
const missing=required.filter(value=>!migration.includes(value));
if(missing.length){console.error(`Missing Trust Assurance boundaries: ${missing.join(', ')}`);process.exit(1)}
const forbidden=[/signed[_ -]?url/i,/provider[_ -]?key/i,/raw[_ -]?log/i,/customer[_ -]?document/i];
for(const file of ['services/trustAssurance/contracts.ts','services/trustAssurance/domain.ts']){const source=fs.readFileSync(file,'utf8');for(const pattern of forbidden)if(pattern.test(source)){console.error(`Forbidden evidence payload concept in ${file}: ${pattern}`);process.exit(1)}}
console.log('Trust Assurance boundary scan passed');

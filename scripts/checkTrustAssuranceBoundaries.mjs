import fs from 'node:fs';
const migration=fs.readFileSync('supabase/migrations/20260807120000_trust_assurance_evidence_hub.sql','utf8');
const required=['FORCE ROW LEVEL SECURITY','trust_assurance_immutable','trust_assurance_command','IDEMPOTENCY_CONFLICT','trust_one_current_publication','REVOKE ALL','service_role','trust_audit'];
const missing=required.filter(value=>!migration.includes(value));
if(missing.length){console.error(`Missing Trust Assurance boundaries: ${missing.join(', ')}`);process.exit(1)}
const forbidden=[/signed[_ -]?url/i,/provider[_ -]?key/i,/raw[_ -]?log/i,/customer[_ -]?document/i];
for(const file of ['services/trustAssurance/contracts.ts','services/trustAssurance/domain.ts']){const source=fs.readFileSync(file,'utf8');for(const pattern of forbidden)if(pattern.test(source)){console.error(`Forbidden evidence payload concept in ${file}: ${pattern}`);process.exit(1)}}
console.log('Trust Assurance boundary scan passed');

import fs from 'node:fs';
const candidates=fs.readdirSync('supabase/migrations').filter(name=>/^\d{14}_trust_assurance_evidence_hub\.sql$/.test(name));
if(candidates.length!==1){console.error(`Expected exactly one Trust Assurance migration, found ${candidates.length}`);process.exit(1)}
const migration=fs.readFileSync(`supabase/migrations/${candidates[0]}`,'utf8');
const required=['FORCE ROW LEVEL SECURITY','trust_assurance_immutable','trust_assurance_command','IDEMPOTENCY_CONFLICT','trust_one_current_publication','REVOKE ALL','service_role','trust_audit','trust_assurance_evidence_freshness','trust_assurance_effective_claim_law','trust-current-publication:','trust_assurance_internal_projection','trust_assurance_buyer_projection','pg_advisory_xact_lock','trust_assurance_assert_active_participant','FOR SHARE OF p,om,wm,o,w','trust_assurance_lock_snapshot_selection','ORDER BY c.id FOR SHARE OF c','ORDER BY e.id,ev.id FOR SHARE OF e'];
const missing=required.filter(value=>!migration.includes(value));
if(missing.length){console.error(`Missing Trust Assurance boundaries: ${missing.join(', ')}`);process.exit(1)}
const forbidden=[/signed[_ -]?url/i,/provider[_ -]?key/i,/raw[_ -]?log/i,/customer[_ -]?document/i];
for(const file of ['services/trustAssurance/contracts.ts','services/trustAssurance/domain.ts']){const source=fs.readFileSync(file,'utf8');for(const pattern of forbidden)if(pattern.test(source)){console.error(`Forbidden evidence payload concept in ${file}: ${pattern}`);process.exit(1)}}
const runtimeFiles=['components/admin/TrustCenterPanel.tsx','playwright.trust-assurance.config.ts','.github/workflows/trust-assurance.yml','vite.trust-assurance.config.ts','tests/trust-assurance/browser/trustAssuranceHarness.tsx'];
for(const file of runtimeFiles){const source=fs.readFileSync(file,'utf8');if(source.includes('VITE_RUNTIME_MODE')){console.error(`Obsolete Trust runtime authority in ${file}`);process.exit(1)}}
const panel=fs.readFileSync('components/admin/TrustCenterPanel.tsx','utf8');
if(!panel.includes('getRuntimeModeResolution()')||panel.includes('resolveRuntimeMode(')){console.error('Trust Center must consume canonical runtime resolution');process.exit(1)}
const workflow=fs.readFileSync('.github/workflows/trust-assurance.yml','utf8'),playwright=fs.readFileSync('playwright.trust-assurance.config.ts','utf8');
if(!workflow.includes('VITE_AVALA_RUNTIME_MODE: pilot')||!playwright.includes("VITE_AVALA_RUNTIME_MODE:'pilot'")){console.error('Trust pilot browser harness must use canonical runtime authority');process.exit(1)}
const client=fs.readFileSync('services/trustAssurance/client.ts','utf8');
for(const token of ["supabase.functions.invoke('trust-assurance-command'","supabase.functions.invoke('trust-assurance-query'",'getRuntimeDataAccess()','isSupabaseConfigured()'])if(!client.includes(token)){console.error(`Missing authenticated Trust client boundary ${token}`);process.exit(1)}
if(client.includes('/functions/v1/')||/\bfetch\s*\(/.test(client)||/Authorization\s*:/.test(client)){console.error('Trust client contains a raw or caller-authenticated transport path');process.exit(1)}
const queryEdge=fs.readFileSync('supabase/functions/trust-assurance-query/index.ts','utf8');
if(!queryEdge.includes("request.method !== 'POST'")||!queryEdge.includes('decodeTrustAssuranceQueryRequest')||queryEdge.includes('searchParams')){console.error('Trust query Edge boundary must be strict authenticated POST');process.exit(1)}
const commandEdge=fs.readFileSync('supabase/functions/trust-assurance-command/index.ts','utf8');
const trustHttp=fs.readFileSync('supabase/functions/_shared/trustAssuranceHttp.ts','utf8');
if(!commandEdge.includes('trustAssuranceCommandResponse')||!queryEdge.includes('trustAssuranceQueryResponse')||!trustHttp.includes('...corsHeaders')){console.error('Trust actual responses must use the shared CORS response contract');process.exit(1)}
const connected=fs.readFileSync('components/admin/trust-assurance/TrustAssuranceConnectedWorkspace.tsx','utf8');
if(connected.includes('loadEnterpriseSessionContexts')||!connected.includes('tenantContext: TenantContextProjection | null')||!connected.includes('generation.current')){console.error('Trust connected workspace must consume and fence the selected provider tenant context');process.exit(1)}
if(!panel.includes('useOrganizationContext()')||!panel.includes('tenantContext={tenantContext}')||!panel.includes('selectionState={sessionState}')){console.error('Trust Center must pass the OrganizationProvider selection into the connected workspace');process.exit(1)}
console.log('Trust Assurance boundary scan passed');

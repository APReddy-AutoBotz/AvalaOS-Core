const ISSUER='https://token.actions.githubusercontent.com';
const AUDIENCE='avalaos-hosted-pilot';
const REPOSITORY='APReddy-AutoBotz/AvalaOS-Core';
const REPOSITORY_ID='1256880940';
const WORKFLOW_PATH='.github/workflows/hosted-pilot-activation-evidence-producer.yml';
const BRANCH_PREFIX='hosted-pilot-dispatch--';
const jsonHeaders={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};

type Json=Record<string,unknown>;
type Claims=Json&{iss?:string;aud?:string|string[];exp?:number;nbf?:number;iat?:number;repository?:string;repository_id?:string;
  event_name?:string;sha?:string;ref?:string;workflow_ref?:string;run_id?:string;run_attempt?:string};

const bad=(status:number,code:string)=>new Response(JSON.stringify({error:code}),{status,headers:jsonHeaders});
const b64u=(value:string)=>{
  const normalized=value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'=');
  const raw=atob(normalized); const out=new Uint8Array(raw.length); for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i); return out;
};
const parseJsonPart=(part:string)=>JSON.parse(new TextDecoder().decode(b64u(part))) as Json;
const exactString=(value:unknown,pattern:RegExp,code:string)=>{if(typeof value!=='string'||!pattern.test(value))throw new Error(code);return value;};
const exactInt=(value:unknown,min:number,code:string)=>{const number=typeof value==='number'?value:Number(value);if(!Number.isSafeInteger(number)||number<min)throw new Error(code);return number;};

let discoveryCache:{jwks_uri:string;expiresAt:number}|undefined;
let jwksCache:{keys:Json[];expiresAt:number}|undefined;
async function discovery(){
  if(discoveryCache&&discoveryCache.expiresAt>Date.now())return discoveryCache;
  const response=await fetch(`${ISSUER}/.well-known/openid-configuration`,{signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error('OIDC_DISCOVERY_FAILED');
  const value=await response.json() as Json;
  if(value.issuer!==ISSUER||typeof value.jwks_uri!=='string'||!value.jwks_uri.startsWith(`${ISSUER}/`))throw new Error('OIDC_DISCOVERY_INVALID');
  discoveryCache={jwks_uri:value.jwks_uri,expiresAt:Date.now()+300000}; return discoveryCache;
}
async function jwks(force=false){
  if(!force&&jwksCache&&jwksCache.expiresAt>Date.now())return jwksCache.keys;
  const config=await discovery();
  const response=await fetch(config.jwks_uri,{signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error('OIDC_JWKS_FAILED');
  const value=await response.json() as Json;
  if(!Array.isArray(value.keys))throw new Error('OIDC_JWKS_INVALID');
  jwksCache={keys:value.keys as Json[],expiresAt:Date.now()+300000}; return jwksCache.keys;
}
async function verifyGithubOidc(token:string,body:Json):Promise<Claims>{
  if(token.length<100||token.length>12000)throw new Error('OIDC_TOKEN_INVALID');
  const parts=token.split('.'); if(parts.length!==3)throw new Error('OIDC_TOKEN_INVALID');
  const header=parseJsonPart(parts[0]); const claims=parseJsonPart(parts[1]) as Claims;
  if(header.alg!=='RS256'||typeof header.kid!=='string')throw new Error('OIDC_ALGORITHM_INVALID');
  let keys=await jwks(); let jwk=keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.use==='sig');
  if(!jwk){keys=await jwks(true);jwk=keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.use==='sig');}
  if(!jwk)throw new Error('OIDC_KEY_NOT_FOUND');
  const key=await crypto.subtle.importKey('jwk',jwk as JsonWebKey,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const verified=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,b64u(parts[2]),new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if(!verified)throw new Error('OIDC_SIGNATURE_INVALID');
  const now=Math.floor(Date.now()/1000);
  const audience=Array.isArray(claims.aud)?claims.aud:[claims.aud];
  if(claims.iss!==ISSUER||!audience.includes(AUDIENCE)||typeof claims.exp!=='number'||claims.exp<=now
    ||(typeof claims.nbf==='number'&&claims.nbf>now+30)||(typeof claims.iat==='number'&&claims.iat>now+30))throw new Error('OIDC_CLAIMS_INVALID');
  if(claims.repository!==REPOSITORY||claims.repository_id!==REPOSITORY_ID||claims.event_name!=='workflow_dispatch')throw new Error('OIDC_REPOSITORY_INVALID');

  const release=exactString(body.expectedReleaseSha,/^[0-9a-f]{40}$/,'RELEASE_INVALID');
  const deploy=exactString(body.deploymentId,/^[0-9a-f]{24}$/,'DEPLOYMENT_INVALID');
  const exercise=exactString(body.exerciseRunId,/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,'EXERCISE_INVALID');
  const runId=exactString(body.producerRunId,/^[1-9][0-9]{0,19}$/,'RUN_ID_INVALID');
  const attempt=exactInt(body.producerRunAttempt,1,'RUN_ATTEMPT_INVALID');
  const branch=`${BRANCH_PREFIX}${deploy}--${exercise}`;
  const ref=`refs/heads/${branch}`;
  if(claims.sha!==release||claims.ref!==ref||claims.run_id!==runId||Number(claims.run_attempt)!==attempt
    ||claims.workflow_ref!==`${REPOSITORY}/${WORKFLOW_PATH}@${ref}`)throw new Error('OIDC_EXACT_RUN_BINDING_MISMATCH');
  return claims;
}

async function rpc(name:string,args:Json){
  const url=Deno.env.get('SUPABASE_URL'); const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)throw new Error('SUPABASE_RUNTIME_CREDENTIALS_MISSING');
  const response=await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{'content-type':'application/json','apikey':key,'authorization':`Bearer ${key}`},body:JSON.stringify(args),signal:AbortSignal.timeout(15000)});
  const text=await response.text();
  if(!response.ok)throw new Error(`RPC_${name.toUpperCase()}_FAILED:${response.status}:${text.slice(0,160)}`);
  return text?JSON.parse(text):null;
}

function common(body:Json){
  return {
    org:exactString(body.organizationId,/^[0-9a-f-]{36}$/,'ORG_INVALID'),
    workspace:exactString(body.workspaceId,/^[0-9a-f-]{36}$/,'WORKSPACE_INVALID'),
    exercise:exactString(body.exerciseRunId,/^[0-9a-f-]{36}$/,'EXERCISE_INVALID'),
    release:exactString(body.expectedReleaseSha,/^[0-9a-f]{40}$/,'RELEASE_INVALID'),
    runId:exactString(body.producerRunId,/^[1-9][0-9]{0,19}$/,'RUN_ID_INVALID'),
    attempt:exactInt(body.producerRunAttempt,1,'RUN_ATTEMPT_INVALID'),
    target:exactString(body.targetFingerprint,/^sha256:[0-9a-f]{64}$/,'TARGET_FINGERPRINT_INVALID'),
    deployment:exactString(body.deploymentFingerprint,/^sha256:[0-9a-f]{64}$/,'DEPLOYMENT_FINGERPRINT_INVALID'),
    migrationCount:exactInt(body.expectedMigrationCount,1,'MIGRATION_COUNT_INVALID'),
    ledgerDigest:exactString(body.expectedLedgerDigest,/^sha256:[0-9a-f]{64}$/,'LEDGER_DIGEST_INVALID'),
  };
}

Deno.serve(async(req:Request)=>{
  try{
    if(req.method!=='POST')return bad(405,'METHOD_NOT_ALLOWED');
    if(Number(req.headers.get('content-length')??'0')>32768)return bad(413,'REQUEST_TOO_LARGE');
    const auth=req.headers.get('authorization')??''; if(!auth.startsWith('Bearer '))return bad(401,'OIDC_TOKEN_REQUIRED');
    const body=await req.json() as Json; await verifyGithubOidc(auth.slice(7),body);
    const input=common(body); const operation=body.operation;
    if(operation==='preflight'){
      const result=await rpc('hosted_pilot_oidc_preflight',{p_expected_target_fingerprint:input.target,p_expected_migration_count:input.migrationCount,p_expected_ledger_digest:input.ledgerDigest});
      return new Response(JSON.stringify(result),{status:200,headers:jsonHeaders});
    }
    const bound={p_org:input.org,p_workspace:input.workspace,p_exercise_run:input.exercise,p_release_sha:input.release,
      p_producer_workflow_path:WORKFLOW_PATH,p_producer_run_id:input.runId,p_producer_run_attempt:input.attempt,
      p_target_fingerprint:input.target,p_deployment_fingerprint:input.deployment,p_expected_migration_count:input.migrationCount,p_expected_ledger_digest:input.ledgerDigest};
    if(operation==='status'){
      const result=await rpc('hosted_pilot_oidc_status',bound); return new Response(JSON.stringify(result),{status:200,headers:jsonHeaders});
    }
    if(operation==='finalize'){
      const recoveryActor=exactString(body.recoveryActorId,/^[0-9a-f-]{36}$/,'RECOVERY_ACTOR_INVALID');
      const recoveryVersion=exactInt(body.recoveryAuthorizationVersion,1,'RECOVERY_VERSION_INVALID');
      const result=await rpc('hosted_pilot_oidc_finalize',{...bound,p_recovery_actor:recoveryActor,p_recovery_authorization_version:recoveryVersion});
      return new Response(JSON.stringify(result),{status:200,headers:jsonHeaders});
    }
    return bad(400,'OPERATION_INVALID');
  }catch(error){
    const message=error instanceof Error?error.message:'HOSTED_VERIFIER_FAILED';
    const publicCode=message.split(':',1)[0].replace(/[^A-Z0-9_]/g,'_').slice(0,96)||'HOSTED_VERIFIER_FAILED';
    console.error(publicCode);
    return bad(publicCode.startsWith('OIDC_')?401:409,publicCode);
  }
});

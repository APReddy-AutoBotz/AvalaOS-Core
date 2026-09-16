import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID,randomBytes,createHmac,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {PROJECTION_POSTGREST_IMAGE,PROJECTION_POSTGRES_IMAGE,PROJECTION_RPC_NAMES,PROJECTION_RPC_CORRECTION,PROJECTION_INTENTIONAL_IDENTITY_ADVANCE,projectionRpcHttpUrl,assertProjectionRpcResult,selectProjectionNoSideEffectTables,selectProjectionRpcSubnet} from './projectionRpcPostgrestContract.mjs';
import {approvedFullChainTip} from './prCMigrationTailContract.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=v=>createHash('sha256').update(v).digest('hex');
const docker=(...args)=>execFileSync('docker',args,{windowsHide:true,timeout:60000,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const scope={organizationId:'00000001-0000-4000-8000-000000000001',workspaceId:'00000002-0000-4000-8000-000000000002'};
const actor='30000008-0000-4000-8000-000000000008',foreignActor='30000012-0000-4000-8000-000000000012';
const capabilities=['delivery.handoff.approve','delivery.package.approve','monitor.baseline.create','monitor.read','project.read'];
const otherWorkspace='00000003-0000-4000-8000-000000000003',foreignOrg='20000001-0000-4000-8000-000000000001',foreignWorkspace='20000002-0000-4000-8000-000000000002';
const role='91000000-0000-4000-8000-000000000001',foreignRole='91000000-0000-4000-8000-000000000002',orgRole='91000000-0000-4000-8000-000000000003',foreignOrgRole='91000000-0000-4000-8000-000000000004';
const assertDenied=r=>{assert.ok((r.status===200&&r.value===null)||([400,401,403].includes(r.status)&&['42501','P0001'].includes(r.value?.code)),'Expected contract denial, not an unavailable/error projection');};

test('actual PostgREST transaction mode preserves governed projection and authorization boundaries',{timeout:300000},async t=>{
 const runId=randomUUID(),label='avalaos.projection-rpc-run',network=`avalaos-projection-${runId}`,postgresName=`avalaos-projection-pg-${runId}`;
 const out=join(root,'output/assess-import/projection-postgrest',runId);await mkdir(out,{recursive:true});
 const report={schemaVersion:1,kind:'disposable-postgrest-14.10-postgresql-16',status:'running',images:[PROJECTION_POSTGRES_IMAGE,PROJECTION_POSTGREST_IMAGE],assertions:[],noSideEffectPhases:[],fixtureOnlyTransitions:[],intentionallyExcludedTables:[PROJECTION_INTENTIONAL_IDENTITY_ADVANCE],cleanup:'not_started'};
 const containers=[];const clients=[];let networkId,db,origin,runtimeContext;
 const jwtSecret=randomBytes(48).toString('hex');
 const token=(role,sub)=>{const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),p=Buffer.from(JSON.stringify({role,...(sub?{sub}:{}),exp:Math.floor(Date.now()/1000)+600})).toString('base64url');return h+'.'+p+'.'+createHmac('sha256',jwtSecret).update(h+'.'+p).digest('base64url');};
 const tokens={authenticated:token('authenticated',actor),foreign:token('authenticated',foreignActor),service:token('service_role')};
 const connect=async url=>{const c=new pg.Client({connectionString:url,connectionTimeoutMillis:2000});await c.connect();clients.push(c);return c;};
 const check=async(name,fn)=>{await t.test(name,async()=>{await fn();report.assertions.push(name);});};
 const authVersion=async()=>Number((await db.query('SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',[scope.organizationId,actor])).rows[0].version);
 const args=async(extra={})=>({p_org:scope.organizationId,p_workspace:scope.workspaceId,p_query:{actorId:actor,authorizationVersion:await authVersion()},...extra});
 const request=async(name,{method='POST',persona='service',body}={})=>{
  const selected=body??await args();const url=projectionRpcHttpUrl(origin,name,method,selected);
  const response=await fetch(url,{method,redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json',...(persona==='anon'?{}:{Authorization:'Bearer '+tokens[persona]})},...(method==='POST'?{body:JSON.stringify(selected)}:{})});
  const text=await response.text();return {status:response.status,value:text?JSON.parse(text):null};
 };
 let digestInventory;
 const productDigest=async()=>{
  const available=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row=>row.tablename);
  const tables=selectProjectionNoSideEffectTables(available);
  if(digestInventory)assert.deepEqual(tables,digestInventory);else digestInventory=tables;
  const values=[];for(const tablename of tables){const v=(await db.query(`SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') AS digest FROM public.${tablename} t`)).rows[0].digest;values.push([tablename,v]);}
  return hash(JSON.stringify(values));
 };
 const noSideEffectPhase=async(label,fn)=>{
  const beforeDigest=await productDigest();await fn();const afterDigest=await productDigest();
  assert.equal(afterDigest,beforeDigest,`${label} changed governed authority or product contents`);
  report.noSideEffectPhases.push({phase:label,beforeDigest,afterDigest,tableCount:digestInventory.length});
  return afterDigest;
 };
 try{
  for(const image of report.images)docker('image','inspect',image);
  const networkIds=docker('network','ls','-q').split(/\s+/).filter(Boolean);
  const occupied=JSON.parse(docker('network','inspect',...networkIds)).flatMap(n=>n.IPAM.Config??[]).map(c=>c.Subnet).filter(c=>c&&!c.includes(':'));
  const hostRoutes=process.platform==='win32'
    ?JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command','Get-NetRoute -AddressFamily IPv4 -ErrorAction Stop | Select-Object -ExpandProperty DestinationPrefix | ConvertTo-Json -Compress'],{windowsHide:true,timeout:20000,encoding:'utf8'}))
    :JSON.parse(execFileSync('ip',['-j','-4','route','show','table','all'],{timeout:20000,encoding:'utf8'})).map(r=>r.dst==='default'?'0.0.0.0/0':r.dst.includes('/')?r.dst:r.dst+'/32');
  assert.ok(Array.isArray(hostRoutes));
  const subnet=selectProjectionRpcSubnet([...occupied,...hostRoutes]);
  // Docker 29 internal networks do not publish ports. Use a dedicated bridge,
  // no external masquerading and explicitly loopback-only published ports.
  networkId=docker('network','create','--subnet',subnet,'--opt','com.docker.network.bridge.enable_ip_masquerade=false','--opt','com.docker.network.bridge.host_binding_ipv4=127.0.0.1','--label',`${label}=${runId}`,network);assert.match(networkId,/^[0-9a-f]{64}$/);
  const limits=['--pull=never','--label',`${label}=${runId}`,'--network',network,'--cpus=1','--pids-limit=128','--log-opt','max-size=1m','--log-opt','max-file=1'];
  const pgId=docker('run','-d','--name',postgresName,...limits,'--memory=1g','--memory-swap=1g','--tmpfs','/var/lib/postgresql/data:rw,size=512m','-e','POSTGRES_HOST_AUTH_METHOD=trust','-p','127.0.0.1::5432',PROJECTION_POSTGRES_IMAGE);containers.push(pgId);
  const info=JSON.parse(docker('inspect',pgId))[0];assert.equal(info.Config.Labels[label],runId);const binding=info.NetworkSettings.Ports['5432/tcp'];assert.equal(binding.length,1);assert.equal(binding[0].HostIp,'127.0.0.1');
  const url=`postgresql://postgres@127.0.0.1:${binding[0].HostPort}/postgres`;
  for(let n=0;n<25;n++){try{db=await connect(url);break;}catch{await pause(400);}}assert.ok(db);
  assert.match((await db.query('SHOW server_version')).rows[0].server_version,/^16\./);
  await db.query(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE ROLE authenticator LOGIN NOINHERIT; GRANT anon,authenticated,service_role TO authenticator;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_app_meta_data jsonb NOT NULL DEFAULT '{}',banned_until timestamptz,email_confirmed_at timestamptz);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $uid$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.sub',true),''),NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $uid$;
    GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
  const migrations=(await readdir(join(root,'supabase/migrations'))).filter(n=>n.endsWith('.sql')).sort();assert.equal(approvedFullChainTip(migrations),'20260916203406');assert.equal(migrations.at(-1),PROJECTION_RPC_CORRECTION);
  for(const name of migrations.slice(0,-1)){await db.query('BEGIN');try{await db.query(await readFile(join(root,'supabase/migrations',name),'utf8'));await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}}
  await db.query('INSERT INTO auth.users(id) VALUES($1),($2)',[actor,foreignActor]);
  await db.query("INSERT INTO profiles(id,email) VALUES($1,'rpc-author@fixture.invalid'),($2,'rpc-foreign@fixture.invalid')",[actor,foreignActor]);
  await db.query("INSERT INTO organizations(id,name,slug) VALUES($1,'RPC synthetic','rpc-synthetic'),($2,'RPC foreign','rpc-foreign')",[scope.organizationId,foreignOrg]);
  await db.query("INSERT INTO workspaces(id,org_id,name,slug) VALUES($1,$2,'RPC target','rpc-target'),($3,$2,'RPC other','rpc-other'),($4,$5,'RPC foreign','rpc-foreign')",[scope.workspaceId,scope.organizationId,otherWorkspace,foreignWorkspace,foreignOrg]);
  for(const [id,org,workspace,name] of [[role,scope.organizationId,scope.workspaceId,'rpc-author'],[foreignRole,foreignOrg,foreignWorkspace,'rpc-foreign'],[orgRole,scope.organizationId,null,'rpc-org'],[foreignOrgRole,foreignOrg,null,'rpc-foreign-org']])await db.query("INSERT INTO roles(id,org_id,workspace_id,name,slug,scope,permissions,status) VALUES($1,$2,$3,$4,$4,$5,'[]','active')",[id,org,workspace,name,workspace?'workspace':'organization']);
  await db.query('INSERT INTO role_capabilities(role_id,capability_key) SELECT $1,unnest($2::text[])',[role,capabilities]);
  await db.query("INSERT INTO role_capabilities(role_id,capability_key) VALUES($1,'monitor.read')",[foreignRole]);
  await db.query("INSERT INTO organization_members(org_id,user_id,role_id,status) VALUES($1,$2,$3,'active'),($4,$5,$6,'active')",[scope.organizationId,actor,orgRole,foreignOrg,foreignActor,foreignOrgRole]);
  await db.query("INSERT INTO workspace_memberships(org_id,workspace_id,user_id,role_id,status) VALUES($1,$2,$3,$4,'active'),($5,$6,$7,$8,'active')",[scope.organizationId,scope.workspaceId,actor,role,foreignOrg,foreignWorkspace,foreignActor,foreignRole]);
  const actual=(await db.query('SELECT p.id,p.status,wm.org_id,wm.workspace_id,array_agg(c.capability_key ORDER BY c.capability_key) AS capabilities FROM profiles p JOIN workspace_memberships wm ON wm.user_id=p.id JOIN role_capabilities c ON c.role_id=wm.role_id WHERE p.id=$1 GROUP BY p.id,p.status,wm.org_id,wm.workspace_id',[actor])).rows[0];
  assert.deepEqual(actual,{id:actor,status:'active',org_id:scope.organizationId,workspace_id:scope.workspaceId,capabilities});runtimeContext={persona:{id:actual.id,state:actual.status,capabilities:actual.capabilities},organizationId:actual.org_id,workspaceId:actual.workspace_id,transport:'postgrest-14.10',migration:PROJECTION_RPC_CORRECTION};
  const apiId=docker('run','-d',...limits,'--memory=256m','--memory-swap=256m','-e',`PGRST_DB_URI=postgresql://authenticator@${postgresName}:5432/postgres`,'-e','PGRST_DB_SCHEMAS=public','-e','PGRST_DB_ANON_ROLE=anon','-e',`PGRST_JWT_SECRET=${jwtSecret}`,'-e','PGRST_LOG_LEVEL=crit','-p','127.0.0.1::3000',PROJECTION_POSTGREST_IMAGE);containers.push(apiId);
  const api=JSON.parse(docker('inspect',apiId))[0];assert.equal(api.Config.Labels[label],runId);const ports=api.NetworkSettings.Ports['3000/tcp'];assert.equal(ports.length,1);assert.equal(ports[0].HostIp,'127.0.0.1');origin=`http://127.0.0.1:${ports[0].HostPort}`;
  // Schema-cache startup can take longer while parallel compilers are active.
  // Bound readiness by elapsed time, retaining only numeric HTTP observations.
  let ready=false;const startupDeadline=Date.now()+60000;report.startupHttpStatuses=[];
  while(Date.now()<startupDeadline){try{const r=await fetch(origin+'/',{signal:AbortSignal.timeout(1500)});await r.arrayBuffer();if(!report.startupHttpStatuses.includes(r.status))report.startupHttpStatuses.push(r.status);if(r.status===200){ready=true;break;}}catch{}await pause(400);}assert.ok(ready,'Owned PostgREST startup failed');
  await noSideEffectPhase('stable-post-rejections',async()=>{
   for(const name of PROJECTION_RPC_NAMES)await check(`old STABLE ${name} POST reproduces SQLSTATE 25006`,async()=>{const r=await request(name);assert.equal(r.status,405);assert.equal(r.value.code,'25006');});
  });
  await noSideEffectPhase('migration-marker-advance-excluded-and-schema-reload',async()=>{
   await db.query('BEGIN');try{await db.query(await readFile(join(root,'supabase/migrations',PROJECTION_RPC_CORRECTION),'utf8'));await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}
   docker('kill','--signal=SIGHUP',apiId);await db.query("NOTIFY pgrst,'reload schema'");
   let reloaded=false;for(let n=0;n<30;n++){const r=await request(PROJECTION_RPC_NAMES[0]);if(r.status===200&&r.value){reloaded=true;break;}assert.equal(r.status,405);assert.equal(r.value.code,'25006');await pause(200);}assert.ok(reloaded,'PostgREST did not reload volatility');
  });
  for(const name of PROJECTION_RPC_NAMES){
   await noSideEffectPhase(`${name}-all-persona-method-and-scope-projections`,async()=>{
    for(const persona of ['service','authenticated'])await check(`VOLATILE ${name} ${persona} POST succeeds with exact scope`,async()=>{const r=await request(name,{persona});assert.equal(r.status,200);assertProjectionRpcResult(r.value,name,scope);});
    for(const method of ['GET','HEAD'])await check(`VOLATILE ${name} ${method} cannot execute`,async()=>{const r=await request(name,{method,persona:'authenticated'});assert.equal(r.status,405);if(method==='GET')assert.equal(r.value.code,'25006');});
    await check(`${name} anonymous and foreign principals cannot read`,async()=>{for(const persona of ['anon','foreign'])assertDenied(await request(name,{persona}));});
    await check(`${name} service stale authority and wrong workspace reject`,async()=>{const stale=await args();stale.p_query.authorizationVersion=0;assertDenied(await request(name,{body:stale}));for(const body of [await args({p_workspace:otherWorkspace}),await args({p_org:foreignOrg,p_workspace:foreignWorkspace})])assertDenied(await request(name,{body}));});
    await check(`${name} missing service subject or version cannot become authority`,async()=>{for(const p_query of [{},{actorId:actor},{authorizationVersion:await authVersion()}])assertDenied(await request(name,{body:{p_org:scope.organizationId,p_workspace:scope.workspaceId,p_query}}));});
    await check(`${name} authenticated wrong workspace and organization reject`,async()=>{for(const body of [await args({p_workspace:otherWorkspace}),await args({p_org:foreignOrg,p_workspace:foreignWorkspace})])assertDenied(await request(name,{persona:'authenticated',body}));});
    await check(`${name} authenticated subject cannot be substituted by query claims`,async()=>{const r=await request(name,{persona:'authenticated',body:{p_org:scope.organizationId,p_workspace:scope.workspaceId,p_query:{actorId:foreignActor,authorizationVersion:0}}});assert.equal(r.status,200);assertProjectionRpcResult(r.value,name,scope);});
   });
  }
  const beforeFixture=await productDigest(),beforeFixtureVersion=await authVersion();
  assert.ok(Number.isSafeInteger(beforeFixtureVersion)&&beforeFixtureVersion>0);
  await db.query("UPDATE workspace_memberships SET status='suspended' WHERE org_id=$1 AND workspace_id=$2 AND user_id=$3",[scope.organizationId,scope.workspaceId,actor]);
  const suspendedFixture=await productDigest(),suspendedFixtureVersion=await authVersion();assert.notEqual(suspendedFixture,beforeFixture);
  assert.equal(suspendedFixtureVersion,beforeFixtureVersion+1);
  try{await check('revoked membership denies both projections without fallback',async()=>{
   await noSideEffectPhase('revoked-membership-projection-denials',async()=>{for(const name of PROJECTION_RPC_NAMES)assertDenied(await request(name,{persona:'authenticated'}));});
  });}finally{await db.query("UPDATE workspace_memberships SET status='active' WHERE org_id=$1 AND workspace_id=$2 AND user_id=$3",[scope.organizationId,scope.workspaceId,actor]);}
  const restoredFixture=await productDigest(),restoredFixtureVersion=await authVersion();assert.notEqual(restoredFixture,suspendedFixture);
  assert.equal(restoredFixtureVersion,suspendedFixtureVersion+1);
  assert.equal((await db.query("SELECT status FROM workspace_memberships WHERE org_id=$1 AND workspace_id=$2 AND user_id=$3",[scope.organizationId,scope.workspaceId,actor])).rows[0].status,'active');
  report.fixtureOnlyTransitions.push({fixture:'workspace-membership-revocation-and-restoration',beforeDigest:beforeFixture,suspendedDigest:suspendedFixture,restoredDigest:restoredFixture,authorizationVersions:{before:beforeFixtureVersion,suspended:suspendedFixtureVersion,restored:restoredFixtureVersion}});
  await noSideEffectPhase('authorization-lock-serialization',async()=>{
   await check('canonical authorization locks still serialize revocation',async()=>{const writer=await connect(url);for(const name of PROJECTION_RPC_NAMES){await db.query('BEGIN');try{await db.query(`SELECT public.${name}($1,$2,$3::jsonb)`,[scope.organizationId,scope.workspaceId,JSON.stringify((await args()).p_query)]);await writer.query('BEGIN');await writer.query("SET LOCAL lock_timeout='150ms'");await assert.rejects(writer.query("UPDATE workspace_memberships SET status='suspended' WHERE org_id=$1 AND workspace_id=$2 AND user_id=$3",[scope.organizationId,scope.workspaceId,actor]),e=>e.code==='55P03');await writer.query('ROLLBACK');}finally{await db.query('ROLLBACK');await writer.query('ROLLBACK');}}});
  });
  await check('all projection phases preserve exact governed authority, process, receipt, effect and audit contents',async()=>{assert.equal(await productDigest(),restoredFixture);assert.equal(report.noSideEffectPhases.length,6);report.unchangedGovernedDigest=restoredFixture;report.governedTableCount=digestInventory.length;});
  // node:test child failures do not throw into their parent: require all exact
  // completed assertions before emitting any PR-C evidence marker.
  assert.equal(report.assertions.length,23);report.runtimeContext=runtimeContext;report.status='passed';
 }catch(e){report.status='failed';report.error={name:e.name,code:e.code,operator:e.operator};throw e;}
 finally{
  await Promise.all(clients.map(c=>c.end().catch(()=>{})));let clean=true;
  for(const id of [...containers].reverse()){try{const info=JSON.parse(docker('inspect',id))[0];assert.equal(info.Config.Labels[label],runId);docker('rm','-f',id);assert.equal(docker('ps','-aq','--filter',`id=${id}`),'');}catch{clean=false;}}
  if(networkId){try{const info=JSON.parse(docker('network','inspect',networkId))[0];assert.equal(info.Labels[label],runId);assert.deepEqual(info.Containers,{});docker('network','rm',networkId);assert.equal(docker('network','ls','-q','--filter',`id=${networkId}`),'');}catch{clean=false;}}
  report.cleanup=clean?'verified_owned_resources_removed':'failed';if(!clean)report.status='failed';await writeFile(join(out,'result.json'),JSON.stringify(report,null,2)+'\n');assert.ok(clean,'Owned PostgREST cleanup failed');
 }
 assert.equal(report.status,'passed');
 for(const [testId,assertionId] of [['DELIVERY-TR-006','POSTGREST-DELIVERY-LOCKED-PROJECTION'],['MONITOR-TR-004','POSTGREST-MONITOR-LOCKED-PROJECTION'],['AUTH-002','POSTGREST-PROJECTION-AUTHORITY-NEGATIVES']])console.log(`PR_C_ASSERTION ${JSON.stringify({testId,assertionId,fixture:'projection-rpc-postgrest-v1',owner:'postgrest',result:'passed',runtimeContext})}`);
});

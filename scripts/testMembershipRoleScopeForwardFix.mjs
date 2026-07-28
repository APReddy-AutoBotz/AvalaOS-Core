import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

/** Executable authority evidence for the PR 1B table-specific membership triggers. */
export async function testMembershipRoleScopeForwardFix(client) {
  const id=()=>randomUUID();
  const org=id(), foreignOrg=id(), workspace=id(), otherWorkspace=id(), foreignWorkspace=id();
  const actor=id(), workspaceActor=id(), rolelessActor=id();
  const orgRole=id(), workspaceRole=id(), otherWorkspaceRole=id(), foreignOrgRole=id(), foreignWorkspaceRole=id(), inactiveOrgRole=id(), deletedOrgRole=id(), inactiveWorkspaceRole=id(), deletedWorkspaceRole=id();
  const passed=[];
  const pass=name=>{passed.push(name);console.log(`PASS membership trigger: ${name}`)};
  const version=async(user)=>Number((await client.query('select version from public.authorization_versions where org_id=$1 and user_id=$2',[org,user])).rows[0]?.version??0);
  const count=async(table,user)=>Number((await client.query(`select count(*) n from public.${table} where org_id=$1 and user_id=$2`,[org,user])).rows[0].n);
  const rejected=async(name,table,user,sql,params,pattern=/PR1B_MEMBERSHIP_ROLE_SCOPE_INVALID|foreign key/i)=>{
    const beforeCount=await count(table,user), beforeVersion=await version(user);
    await client.query('savepoint invalid_membership');
    try { await client.query(sql,params); assert.fail(`${name} unexpectedly succeeded`); }
    catch(error) { await client.query('rollback to savepoint invalid_membership'); assert.match(error.message,pattern); }
    finally { await client.query('release savepoint invalid_membership'); }
    assert.equal(await count(table,user),beforeCount,`${name} changed membership state`);
    assert.equal(await version(user),beforeVersion,`${name} changed authorization state`);
    pass(name);
  };

  await client.query('begin');
  try {
    for(const signature of ['public.pr1b_enforce_membership_role_scope()','public.pr1b_enforce_organization_membership_role_scope()','public.pr1b_enforce_workspace_membership_role_scope()'])for(const role of ['anon','authenticated','service_role'])assert.equal((await client.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,signature])).rows[0].allowed,false,`${signature} must not be directly executable by ${role}`);
    assert.equal(Number((await client.query("select count(*) n from pg_trigger where not tgisinternal and tgfoid='public.pr1b_enforce_membership_role_scope()'::regprocedure")).rows[0].n),0,'legacy shared helper remains trigger-attached');
    await client.query('insert into auth.users(id) values($1),($2),($3)',[actor,workspaceActor,rolelessActor]);
    await client.query("insert into public.profiles(id,email) values($1,'trigger-actor@example.invalid'),($2,'trigger-workspace@example.invalid'),($3,'trigger-roleless@example.invalid')",[actor,workspaceActor,rolelessActor]);
    await client.query("insert into public.organizations(id,name,slug) values($1,'Trigger tenant','trigger-'||$1::text),($2,'Foreign tenant','foreign-'||$2::text)",[org,foreignOrg]);
    await client.query("insert into public.workspaces(id,org_id,name,slug) values($1,$2,'Workspace','workspace-'||$1::text),($3,$2,'Other workspace','workspace-'||$3::text),($4,$5,'Foreign workspace','workspace-'||$4::text)",[workspace,org,otherWorkspace,foreignWorkspace,foreignOrg]);
    await client.query(`insert into public.roles(id,org_id,workspace_id,name,slug,scope,permissions,status,deleted_at) values
      ($1,$10,null,'Organization role','org-role-'||$1::text,'organization','[]','active',null),
      ($2,$10,$11,'Workspace role','ws-role-'||$2::text,'workspace','[]','active',null),
      ($3,$10,$12,'Other workspace role','other-ws-role-'||$3::text,'workspace','[]','active',null),
      ($4,$13,null,'Foreign organization role','foreign-org-role-'||$4::text,'organization','[]','active',null),
      ($5,$13,$14,'Foreign workspace role','foreign-ws-role-'||$5::text,'workspace','[]','active',null),
      ($6,$10,null,'Inactive organization role','inactive-org-role-'||$6::text,'organization','[]','disabled',null),
      ($7,$10,null,'Deleted organization role','deleted-org-role-'||$7::text,'organization','[]','active',now()),
      ($8,$10,$11,'Inactive workspace role','inactive-ws-role-'||$8::text,'workspace','[]','disabled',null),
      ($9,$10,$11,'Deleted workspace role','deleted-ws-role-'||$9::text,'workspace','[]','active',now())`,[orgRole,workspaceRole,otherWorkspaceRole,foreignOrgRole,foreignWorkspaceRole,inactiveOrgRole,deletedOrgRole,inactiveWorkspaceRole,deletedWorkspaceRole,org,workspace,otherWorkspace,foreignOrg,foreignWorkspace]);
    await client.query("insert into public.role_capabilities(role_id,capability_key) values($1,'studio.artifacts.read'),($2,'studio.artifacts.edit')",[orgRole,workspaceRole]);

    const orgBefore=await version(actor);
    await client.query("insert into public.organization_members(org_id,user_id,role_id,status) values($1,$2,$3,'active')",[org,actor,orgRole]);
    assert.equal(await count('organization_members',actor),1);pass('same-organization active organization role succeeds');
    assert.ok(await version(actor)>orgBefore);pass('organization membership increments authorization version');
    await client.query("insert into public.workspace_memberships(org_id,workspace_id,user_id,role_id,status) values($1,$2,$3,null,'active')",[org,workspace,actor]);
    await client.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
    assert.equal((await client.query("select public.has_workspace_capability($1,$2,'studio.artifacts.read') allowed",[workspace,org])).rows[0].allowed,true);pass('organization capability is available through accepted authority evaluation');

    const orgInsert="insert into public.organization_members(org_id,user_id,role_id,status) values($1,$2,$3,'active')";
    await rejected('missing organization role fails without mutation','organization_members',rolelessActor,orgInsert,[org,rolelessActor,id()]);
    await rejected('inactive organization role fails without mutation','organization_members',rolelessActor,orgInsert,[org,rolelessActor,inactiveOrgRole]);
    await rejected('deleted organization role fails without mutation','organization_members',rolelessActor,orgInsert,[org,rolelessActor,deletedOrgRole]);
    await rejected('foreign-organization role fails without mutation','organization_members',rolelessActor,orgInsert,[org,rolelessActor,foreignOrgRole]);
    await rejected('workspace-scoped role fails for organization membership without mutation','organization_members',rolelessActor,orgInsert,[org,rolelessActor,workspaceRole]);
    await client.query('savepoint malformed_role');
    try { await client.query("insert into public.roles(id,org_id,workspace_id,name,slug,scope,permissions) values($1,$2,$3,'Malformed','malformed-'||$1::text,'organization','[]')",[id(),org,workspace]); assert.fail('organization role carrying workspace unexpectedly succeeded'); }
    catch(error){await client.query('rollback to savepoint malformed_role');assert.match(error.message,/roles_scope_check/)} finally {await client.query('release savepoint malformed_role')}
    pass('organization role carrying workspace_id is rejected by relational authority');

    await client.query("insert into public.organization_members(org_id,user_id,role_id,status) values($1,$2,$3,'active')",[org,rolelessActor,orgRole]);
    await client.query("insert into public.workspace_memberships(org_id,workspace_id,user_id,role_id,status) values($1,$2,$3,null,'active')",[org,workspace,rolelessActor]);
    pass('roleless workspace membership succeeds as presence-only');
    await client.query("insert into public.organization_members(org_id,user_id,role_id,status) values($1,$2,$3,'active')",[org,workspaceActor,orgRole]);
    await client.query("insert into public.workspace_memberships(org_id,workspace_id,user_id,role_id,status) values($1,$2,$3,$4,'active')",[org,workspace,workspaceActor,workspaceRole]);
    pass('same-workspace active workspace role succeeds');
    await client.query("select set_config('request.jwt.claim.sub',$1,false)",[rolelessActor]);
    assert.equal((await client.query("select public.has_workspace_capability($1,$2,'studio.artifacts.read') allowed",[workspace,org])).rows[0].allowed,true);pass('organization capability inherits only with valid organization membership');
    await client.query("select set_config('request.jwt.claim.sub',$1,false)",[workspaceActor]);
    assert.equal((await client.query("select public.has_workspace_capability($1,$2,'studio.artifacts.edit') here,public.has_workspace_capability($3,$2,'studio.artifacts.edit') elsewhere",[workspace,org,otherWorkspace])).rows[0].here,true);
    assert.equal((await client.query("select public.has_workspace_capability($1,$2,'studio.artifacts.edit') elsewhere",[otherWorkspace,org])).rows[0].elsewhere,false);pass('workspace capability is restricted to exact workspace');

    const wmInsert="insert into public.workspace_memberships(org_id,workspace_id,user_id,role_id,status) values($1,$2,$3,$4,'active')";
    const invalidActor=id();await client.query('insert into auth.users(id) values($1)',[invalidActor]);await client.query("insert into profiles(id,email) values($1,'invalid-workspace@example.invalid')",[invalidActor]);await client.query("insert into organization_members(org_id,user_id,role_id,status) values($1,$2,$3,'active')",[org,invalidActor,orgRole]);
    await rejected('missing workspace role fails without mutation','workspace_memberships',invalidActor,wmInsert,[org,workspace,invalidActor,id()]);
    await rejected('inactive workspace role fails without mutation','workspace_memberships',invalidActor,wmInsert,[org,workspace,invalidActor,inactiveWorkspaceRole]);
    await rejected('deleted workspace role fails without mutation','workspace_memberships',invalidActor,wmInsert,[org,workspace,invalidActor,deletedWorkspaceRole]);
    await rejected('foreign-organization workspace role fails without mutation','workspace_memberships',invalidActor,wmInsert,[org,workspace,invalidActor,foreignWorkspaceRole]);
    await rejected('organization-scoped role fails for workspace membership without mutation','workspace_memberships',invalidActor,wmInsert,[org,workspace,invalidActor,orgRole]);
    await rejected('other-workspace role fails without mutation','workspace_memberships',invalidActor,wmInsert,[org,workspace,invalidActor,otherWorkspaceRole]);

    const triggerStates=await client.query("select tgname,tgenabled from pg_trigger where tgname in ('trg_pr1b_org_membership_role_scope','trg_pr1b_workspace_membership_role_scope') order by tgname");
    assert.deepEqual(triggerStates.rows.map(r=>r.tgenabled),['O','O']);pass('table-specific membership triggers remain enabled');
    await client.query('rollback');
    return passed;
  } catch(error) { await client.query('rollback'); throw error; }
}

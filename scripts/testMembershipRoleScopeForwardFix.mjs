import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const authUsersInsert='insert into auth.users(id) values($1::uuid),($2::uuid),($3::uuid)';

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
    const authIdType=(await client.query("select format_type(a.atttypid,a.atttypmod) type from pg_attribute a where a.attrelid='auth.users'::regclass and a.attname='id' and not a.attisdropped")).rows[0]?.type;
    assert.equal(authIdType,'uuid','full-chain auth.users.id must remain uuid');
    assert.match(authUsersInsert,/values\(\$1::uuid\),\(\$2::uuid\),\(\$3::uuid\)/);
    assert.doesNotMatch(authUsersInsert,/values\(\$1\),\(\$2\),\(\$3\)/);
    for(const signature of ['public.pr1b_enforce_membership_role_scope()','public.pr1b_enforce_organization_membership_role_scope()','public.pr1b_enforce_workspace_membership_role_scope()'])for(const role of ['anon','authenticated','service_role'])assert.equal((await client.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,signature])).rows[0].allowed,false,`${signature} must not be directly executable by ${role}`);
    assert.equal(Number((await client.query("select count(*) n from pg_trigger where not tgisinternal and tgfoid='public.pr1b_enforce_membership_role_scope()'::regprocedure")).rows[0].n),0,'legacy shared helper remains trigger-attached');
    await client.query(authUsersInsert,[actor,workspaceActor,rolelessActor]);
    await client.query("insert into public.profiles(id,email) values($1::uuid,'trigger-actor@example.invalid'),($2::uuid,'trigger-workspace@example.invalid'),($3::uuid,'trigger-roleless@example.invalid')",[actor,workspaceActor,rolelessActor]);
    await client.query("insert into public.organizations(id,name,slug) values($1::uuid,'Trigger tenant','trigger-'||($1::uuid)::text),($2::uuid,'Foreign tenant','foreign-'||($2::uuid)::text)",[org,foreignOrg]);
    await client.query("insert into public.workspaces(id,org_id,name,slug) values($1::uuid,$2::uuid,'Workspace','workspace-'||($1::uuid)::text),($3::uuid,$2::uuid,'Other workspace','workspace-'||($3::uuid)::text),($4::uuid,$5::uuid,'Foreign workspace','workspace-'||($4::uuid)::text)",[workspace,org,otherWorkspace,foreignWorkspace,foreignOrg]);
    await client.query(`insert into public.roles(id,org_id,workspace_id,name,slug,scope,permissions,status,deleted_at) values
      ($1::uuid,$10::uuid,null,'Organization role','org-role-'||($1::uuid)::text,'organization','[]','active',null),
      ($2::uuid,$10::uuid,$11::uuid,'Workspace role','ws-role-'||($2::uuid)::text,'workspace','[]','active',null),
      ($3::uuid,$10::uuid,$12::uuid,'Other workspace role','other-ws-role-'||($3::uuid)::text,'workspace','[]','active',null),
      ($4::uuid,$13::uuid,null,'Foreign organization role','foreign-org-role-'||($4::uuid)::text,'organization','[]','active',null),
      ($5::uuid,$13::uuid,$14::uuid,'Foreign workspace role','foreign-ws-role-'||($5::uuid)::text,'workspace','[]','active',null),
      ($6::uuid,$10::uuid,null,'Inactive organization role','inactive-org-role-'||($6::uuid)::text,'organization','[]','disabled',null),
      ($7::uuid,$10::uuid,null,'Deleted organization role','deleted-org-role-'||($7::uuid)::text,'organization','[]','active',now()),
      ($8::uuid,$10::uuid,$11::uuid,'Inactive workspace role','inactive-ws-role-'||($8::uuid)::text,'workspace','[]','disabled',null),
      ($9::uuid,$10::uuid,$11::uuid,'Deleted workspace role','deleted-ws-role-'||($9::uuid)::text,'workspace','[]','active',now())`,[orgRole,workspaceRole,otherWorkspaceRole,foreignOrgRole,foreignWorkspaceRole,inactiveOrgRole,deletedOrgRole,inactiveWorkspaceRole,deletedWorkspaceRole,org,workspace,otherWorkspace,foreignOrg,foreignWorkspace]);
    await client.query("insert into public.role_capabilities(role_id,capability_key) values($1::uuid,'studio.artifacts.read'),($2::uuid,'studio.artifacts.edit')",[orgRole,workspaceRole]);

    const orgBefore=await version(actor);
    await client.query("insert into public.organization_members(org_id,user_id,role_id,status) values($1::uuid,$2::uuid,$3::uuid,'active')",[org,actor,orgRole]);
    assert.equal(await count('organization_members',actor),1);pass('same-organization active organization role succeeds');
    assert.ok(await version(actor)>orgBefore);pass('organization membership increments authorization version');
    await client.query("insert into public.workspace_memberships(org_id,workspace_id,user_id,role_id,status) values($1::uuid,$2::uuid,$3::uuid,null,'active')",[org,workspace,actor]);
    await client.query("select set_config('request.jwt.claim.sub',($1::uuid)::text,false)",[actor]);
    assert.equal((await client.query("select public.has_workspace_capability($1,$2,'studio.artifacts.read') allowed",[workspace,org])).rows[0].allowed,true);pass('organization capability is available through accepted authority evaluation');

    const orgInsert="insert into public.organization_members(org_id,user_id,role_id,status) values($1::uuid,$2::uuid,$3::uuid,'active')";
    await rejected('missing organization role fails without mutation','organization_members',rolelessActor,orgInsert,[org,rolelessActor,id()]);
    await rejected('inactive organization role fails without mutation','organization_members',rolelessActor,orgInsert,[org,rolelessActor,inactiveOrgRole]);
    await rejected('deleted organization role fails without mutation','organization_members',rolelessActor,orgInsert,[org,rolelessActor,deletedOrgRole]);
    await rejected('foreign-organization role fails without mutation','organization_members',rolelessActor,orgInsert,[org,rolelessActor,foreignOrgRole]);
    await rejected('workspace-scoped role fails for organization membership without mutation','organization_members',rolelessActor,orgInsert,[org,rolelessActor,workspaceRole]);
    await client.query('savepoint malformed_role');
    try { await client.query("insert into public.roles(id,org_id,workspace_id,name,slug,scope,permissions) values($1::uuid,$2::uuid,$3::uuid,'Malformed','malformed-'||($1::uuid)::text,'organization','[]')",[id(),org,workspace]); assert.fail('organization role carrying workspace unexpectedly succeeded'); }
    catch(error){await client.query('rollback to savepoint malformed_role');assert.match(error.message,/roles_scope_check/)} finally {await client.query('release savepoint malformed_role')}
    pass('organization role carrying workspace_id is rejected by relational authority');

    await client.query("insert into public.organization_members(org_id,user_id,role_id,status) values($1::uuid,$2::uuid,$3::uuid,'active')",[org,rolelessActor,orgRole]);
    await client.query("insert into public.workspace_memberships(org_id,workspace_id,user_id,role_id,status) values($1::uuid,$2::uuid,$3::uuid,null,'active')",[org,workspace,rolelessActor]);
    pass('roleless workspace membership succeeds as presence-only');
    await client.query("insert into public.organization_members(org_id,user_id,role_id,status) values($1::uuid,$2::uuid,$3::uuid,'active')",[org,workspaceActor,orgRole]);
    await client.query("insert into public.workspace_memberships(org_id,workspace_id,user_id,role_id,status) values($1::uuid,$2::uuid,$3::uuid,$4::uuid,'active')",[org,workspace,workspaceActor,workspaceRole]);
    pass('same-workspace active workspace role succeeds');
    await client.query("select set_config('request.jwt.claim.sub',($1::uuid)::text,false)",[rolelessActor]);
    assert.equal((await client.query("select public.has_workspace_capability($1,$2,'studio.artifacts.read') allowed",[workspace,org])).rows[0].allowed,true);pass('organization capability inherits only with valid organization membership');
    await client.query("select set_config('request.jwt.claim.sub',($1::uuid)::text,false)",[workspaceActor]);
    assert.equal((await client.query("select public.has_workspace_capability($1,$2,'studio.artifacts.edit') here,public.has_workspace_capability($3,$2,'studio.artifacts.edit') elsewhere",[workspace,org,otherWorkspace])).rows[0].here,true);
    assert.equal((await client.query("select public.has_workspace_capability($1,$2,'studio.artifacts.edit') elsewhere",[otherWorkspace,org])).rows[0].elsewhere,false);pass('workspace capability is restricted to exact workspace');

    const wmInsert="insert into public.workspace_memberships(org_id,workspace_id,user_id,role_id,status) values($1::uuid,$2::uuid,$3::uuid,$4::uuid,'active')";
    const invalidActor=id();await client.query('insert into auth.users(id) values($1::uuid)',[invalidActor]);await client.query("insert into profiles(id,email) values($1::uuid,'invalid-workspace@example.invalid')",[invalidActor]);await client.query("insert into organization_members(org_id,user_id,role_id,status) values($1::uuid,$2::uuid,$3::uuid,'active')",[org,invalidActor,orgRole]);
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

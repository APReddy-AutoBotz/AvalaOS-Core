import assert from 'node:assert/strict';
import type { TenantContextProjection } from '../types';
import {
  canManageSyntheticUsers,
  decodeSyntheticAdminResult,
  syntheticAdminErrorCopy,
  syntheticAdminRequest,
  SyntheticAdminOutcomeUnknown,
} from './syntheticAdminClient';
import { SyntheticAdminError } from './syntheticAdminContract';

const ORG='22222222-2222-4222-8222-222222222222';
const WS='33333333-3333-4333-8333-333333333333';
const ACTOR='11111111-1111-4111-8111-111111111111';
const RESERVATION='44444444-4444-4444-8444-444444444444';
const AUTH_USER='66666666-6666-4666-8666-666666666666';
const loginId=`synthetic-${RESERVATION}@avalaos.invalid`;
assert.notEqual(AUTH_USER,RESERVATION,'Auth identity is a separate private ID, never inferred from login ID');
const context:TenantContextProjection={userId:ACTOR,organizationId:ORG,organizationName:'Synthetic org',workspaceId:WS,workspaceName:'Exploratory workspace',authorizationVersion:7,capabilities:['org.admin','admin.synthetic.users.manage']};

void (async()=>{
const seen:any[]=[];
const reserve=await syntheticAdminRequest(context,'reserve',{label:'Finance author',rolePreset:'author'},
  async body=>{seen.push(body);return{status:'reserved',reservationId:RESERVATION,loginId,version:1}},
  {requestId:'55555555-5555-4555-8555-555555555555',idempotencyKey:'synthetic-admin:reserve:original'});
assert.equal(reserve.loginId,loginId);
assert.deepEqual(seen[0],{
  operation:'reserve',organizationId:ORG,workspaceId:WS,expectedAuthorizationVersion:7,
  requestId:'55555555-5555-4555-8555-555555555555',idempotencyKey:'synthetic-admin:reserve:original',
  payload:{label:'Finance author',rolePreset:'author'},
});
assert.equal(canManageSyntheticUsers({...context,capabilities:['org.admin']}),false);
assert.equal(canManageSyntheticUsers({...context,capabilities:['admin.synthetic.users.manage']}),false);
assert.equal(canManageSyntheticUsers(context,'stale'),false);
let deniedCalls=0;
await assert.rejects(()=>syntheticAdminRequest({...context,capabilities:['org.admin']},'list',{},async()=>{deniedCalls++;return{status:'listed',roster:[]}}),
  (error:unknown)=>error instanceof SyntheticAdminError && error.errorCode==='PERMISSION_DENIED');
assert.equal(deniedCalls,0,'unauthorized roster request must never leave client');

const roster={reservationId:RESERVATION,label:'Finance author',loginId,rolePreset:'author',state:'active',version:2};
assert.deepEqual(decodeSyntheticAdminResult({status:'listed',roster:[roster],nextCursor:null},'list').roster,[roster]);
for(const hostile of [
  {...roster,loginId:`synthetic-${ACTOR}@avalaos.example`},
  {...roster,loginId:`synthetic-${AUTH_USER}@avalaos.invalid`},
  {...roster,password:'should-not-appear'},
  {...roster,state:'admin'},
]) assert.throws(()=>decodeSyntheticAdminResult({status:'listed',roster:[hostile],nextCursor:null},'list'),SyntheticAdminError);
assert.throws(()=>decodeSyntheticAdminResult({status:'active',reservationId:RESERVATION,version:2,password:'should-not-appear'},'execute'),SyntheticAdminError);
assert.throws(()=>decodeSyntheticAdminResult({status:'active',reservationId:RESERVATION,version:2,loginId:`synthetic-${ACTOR}@avalaos.example`},'execute'),SyntheticAdminError);
assert.doesNotMatch(syntheticAdminErrorCopy(new SyntheticAdminOutcomeUnknown()),/password|email|token/i);
assert.doesNotMatch(syntheticAdminErrorCopy(new SyntheticAdminError('PERMISSION_DENIED')),/PERMISSION_DENIED/);
console.log('Synthetic Admin client binding and non-disclosure tests passed.');
})();

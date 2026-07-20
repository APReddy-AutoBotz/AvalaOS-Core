import assert from 'node:assert/strict';
import { executeAssessV2ReviewCommand } from './assessV2ReviewHandlers.ts';
import { ASSESS_V2_REVIEW_CAPABILITY, AssessV2ReviewDependencies, AssessV2ReviewError, parseAssessV2ReviewEnvelope } from './assessV2ReviewCommand.ts';
import { buildAssessV2ReviewRpcBody } from './assessV2ReviewDb.ts';

const org='11111111-1111-4111-8111-111111111111',workspace='22222222-2222-4222-8222-222222222222',actor='33333333-3333-4333-8333-333333333333',caseId='44444444-4444-4444-8444-444444444444',decisionId='55555555-5555-4555-8555-555555555555',evidenceId='66666666-6666-4666-8666-666666666666';
const envelope={requestId:'77777777-7777-4777-8777-777777777777',idempotencyKey:'attest-current-1',commandType:'assessment_v2.evidence.attest',organizationId:org,workspaceId:workspace,authorizationVersion:7,expectedVersion:4,payload:{caseId,decisionId,reviewVersion:1,evidenceId,claimIds:['primitive.invoice.volume'],outcome:'accepted',rationale:'Source and claim independently checked.'}} as const;
const request=new Request('http://local/assess-v2-command',{method:'POST',body:JSON.stringify(envelope)});
const deps=(capabilities=Object.values(ASSESS_V2_REVIEW_CAPABILITY)):AssessV2ReviewDependencies=>({authenticate:async()=>({id:actor}),loadFreshAuthority:async()=>({actorId:actor,organizationId:org,workspaceId:workspace,authorizationVersion:7,capabilities}),executeAtomicReviewCommand:async command=>({outcome:'committed',resource:{caseId:command.payload.caseId,decisionId:command.payload.decisionId}})});

const main=async()=>{
 const parsed=parseAssessV2ReviewEnvelope(envelope);assert.equal(parsed.payload.outcome,'accepted');assert.deepEqual(parsed.payload.claimIds,['primitive.invoice.volume']);
 const base={...envelope,payload:{caseId,decisionId,reviewVersion:1}};
 const variants=[
  {...base,commandType:'assessment_v2.review.assign',payload:{...base.payload,reviewerId:evidenceId}},
  {...base,commandType:'assessment_v2.review.resolve',payload:{...base.payload,resolution:'approved',rationale:'complete',conditions:[]}},
  {...base,commandType:'assessment_v2.revision.start',payload:{...base.payload,rationale:'revise'}},
  {...base,commandType:'assessment_v2.govern.resolve',payload:{...base.payload,rationale:'controls reviewed'}},
  {...base,commandType:'assessment_v2.studio.handoff'},
 ] as const;
 for(const variant of variants) assert.equal(parseAssessV2ReviewEnvelope(variant).commandType,variant.commandType);
 for(const invalid of [
   {...envelope,payload:{...envelope.payload,reviewerId:actor}},
   {...envelope,payload:{...envelope.payload,claimIds:[]}},
   {...envelope,payload:{...envelope.payload,claimIds:['same','same']}},
   {...envelope,payload:{...envelope.payload,outcome:'verified'}},
   {...envelope,payload:{...envelope.payload,reviewVersion:0}},
 ])assert.throws(()=>parseAssessV2ReviewEnvelope(invalid),e=>e instanceof AssessV2ReviewError&&e.code==='INVALID_COMMAND');
 const result=await executeAssessV2ReviewCommand(request,parsed,deps());assert.equal(result.outcome,'committed');
 await assert.rejects(()=>executeAssessV2ReviewCommand(request,parsed,deps([])),e=>e instanceof AssessV2ReviewError&&e.code==='PERMISSION_DENIED');
 const stale=deps();stale.loadFreshAuthority=async()=>({actorId:actor,organizationId:org,workspaceId:workspace,authorizationVersion:8,capabilities:Object.values(ASSESS_V2_REVIEW_CAPABILITY)});await assert.rejects(()=>executeAssessV2ReviewCommand(request,parsed,stale),e=>e instanceof AssessV2ReviewError&&e.code==='AUTHORITY_STALE');
 const body=buildAssessV2ReviewRpcBody({...parsed,actorId:actor});assert.equal(body.p_actor_id,actor);assert.deepEqual(body.p_payload,parsed.payload);assert.equal((body as Record<string,unknown>).reviewerId,undefined);
 for(const command of ['assessment_v2.review.assign','assessment_v2.review.resolve','assessment_v2.revision.start','assessment_v2.govern.resolve','assessment_v2.studio.handoff'] as const)assert.ok(ASSESS_V2_REVIEW_CAPABILITY[command]);
 assert.throws(()=>parseAssessV2ReviewEnvelope({...envelope,commandType:'assessment_v2.unknown'}),e=>e instanceof AssessV2ReviewError&&e.code==='COMMAND_NOT_SUPPORTED');
 assert.throws(()=>parseAssessV2ReviewEnvelope(null),e=>e instanceof AssessV2ReviewError&&e.code==='INVALID_COMMAND');
 assert.equal(new AssessV2ReviewError('AUTHENTICATION_REQUIRED').status,401);assert.equal(new AssessV2ReviewError('PERMISSION_DENIED').status,403);
 assert.equal(new AssessV2ReviewError('VERSION_CONFLICT').status,409);assert.equal(new AssessV2ReviewError('RESOURCE_NOT_AVAILABLE').status,404);assert.equal(new AssessV2ReviewError('COMMAND_UNAVAILABLE').status,503);
};
main().catch(error=>{console.error(error);process.exitCode=1});

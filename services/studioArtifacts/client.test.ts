import { strict as assert } from 'node:assert';
import type { TenantContextProjection } from '../../types';
import { decodeStudioArtifactProjection, decodeStudioHandoffs, executeStudioArtifactCommand, StudioArtifactBoundaryError, type StudioArtifactTransport } from './client';

const U=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666','77777777-7777-4777-8777-777777777777','88888888-8888-4888-8888-888888888888','99999999-9999-4999-8999-999999999999'] as const;
const context={organizationId:U[0],workspaceId:U[1],authorizationVersion:4} as TenantContextProjection;
const version={id:U[7],version:1,parentVersionId:null,lifecycle:'draft',templateVersion:'brd-v1',contentSchemaVersion:'studio-v1',projectionVersion:'json-v1',content:{title:'Governed'},contentHash:'a'.repeat(64),authorId:U[8],createdAt:'2026-07-27T00:00:00.000Z'};
const projection={id:U[6],artifactType:'brd',aggregateVersion:1,lifecycle:'draft',ancestry:{organizationId:U[0],workspaceId:U[1],caseId:U[2],sourceCaseVersionId:U[3],sourceCaseVersion:2,decisionId:U[4],decisionVersion:3,reviewResolutionId:U[5],governResolutionId:U[6],studioHandoffId:U[7],sourcePackageHash:'b'.repeat(64),sourceSchemaVersion:'assess-v2',ruleSetVersion:'rules-v1',reviewSchemaVersion:'review-v1',reviewSequence:1},currentVersion:version,currentApprovedVersion:null,versions:[version],readOnly:false};

assert.equal(decodeStudioArtifactProjection(projection,context).currentVersion.content.title,'Governed');
assert.throws(()=>decodeStudioArtifactProjection({...projection,clientTemplate:'forbidden'},context),StudioArtifactBoundaryError);
assert.throws(()=>decodeStudioArtifactProjection({...projection,ancestry:{...projection.ancestry,workspaceId:U[2]}},context),StudioArtifactBoundaryError);
assert.throws(()=>decodeStudioArtifactProjection({...projection,currentApprovedVersion:{...version,lifecycle:'draft'}},context),StudioArtifactBoundaryError);
assert.deepEqual(decodeStudioHandoffs([{id:U[7],caseId:U[2],label:'Accepted case',sourcePackageHash:'c'.repeat(64)}]).map(x=>x.label),['Accepted case']);
assert.throws(()=>decodeStudioHandoffs([{id:U[7],caseId:U[2],label:'Legacy',sourcePackageHash:'c'.repeat(64),documentGenerationId:U[3]}]),StudioArtifactBoundaryError);

void (async()=>{let envelope:any;
  const transport:StudioArtifactTransport={readHandoffs:async()=>[],readProjection:async()=>projection,invoke:async(value)=>{envelope=value;return{ok:true,outcome:'committed',receiptId:U[5],resourceId:U[6]};}};
  const committed=await executeStudioArtifactCommand(context,'studio.artifact.generation.request',null,{studioHandoffId:U[7],artifactType:'brd'},'generation-key',transport);
  assert.equal(committed.receiptId,U[5]); assert.equal(envelope.expectedAggregateVersion,0); assert.equal(envelope.expectedArtifactVersion,null); assert.deepEqual(Object.keys(envelope.payload).sort(),['artifactType','studioHandoffId']);
  console.log('studio artifact client: 7 strict projection, isolation, legacy-boundary and command assertions passed');
})().catch(error=>{console.error(error);process.exitCode=1;});

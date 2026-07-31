import assert from 'node:assert/strict';
import {createCommittedStudioFixture} from './studioArtifactPostgresFixture.mjs';

const uuid=n=>`98000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const stableJson=value=>JSON.stringify(value,Object.keys(value).sort());
async function stage(label,operation){try{const result=await operation();console.log(`PRIVATE FIXTURE PASS ${label}`);return result}catch(error){throw new Error(`PRIVATE FIXTURE FAILED ${label}: ${error instanceof Error?error.message:String(error)}`)}}
export async function privateCommand(db,command){
 const normalized=structuredClone(command);
 if(normalized.commandType==='studio.retention.policy.publish'){
  normalized.expectedArtifactVersion??=null;normalized.expectedRenditionVersion??=null;
 }else if(normalized.commandType==='studio.rendition.generate'){
  const version=(await db.query('SELECT artifact_id,version FROM public.studio_artifact_versions WHERE id=$1::uuid',[normalized.payload.artifactVersionId])).rows[0];
  normalized.payload.artifactId??=version.artifact_id;normalized.expectedArtifactVersion??=Number(version.version);normalized.expectedRenditionVersion??=null;
 }else{
  if(!normalized.payload.renditionId&&normalized.payload.deletionRequestId)normalized.payload.renditionId=(await db.query('SELECT rendition_id FROM public.studio_rendition_deletion_requests WHERE id=$1::uuid',[normalized.payload.deletionRequestId])).rows[0]?.rendition_id;
  const rendition=(await db.query('SELECT artifact_version,lifecycle_version FROM public.studio_renditions WHERE id=$1::uuid',[normalized.payload.renditionId])).rows[0];
  normalized.expectedArtifactVersion??=Number(rendition.artifact_version);normalized.expectedRenditionVersion??=Number(rendition.lifecycle_version);
 }
 const serialized=JSON.stringify(normalized);assert.equal(typeof serialized,'string');return (await stage(normalized.commandType,()=>db.query('SELECT public.studio_private_artifact_command_claim($1::jsonb) result',[serialized]))).rows[0].result
}
export async function downloadCommand(db,command){const serialized=JSON.stringify(command);return (await stage('download claim',()=>db.query('SELECT public.studio_artifact_download_claim($1::jsonb) result',[serialized]))).rows[0].result}
export async function createApprovedStudioFixture(db){
 const base=await createCommittedStudioFixture(db);let aggregate=Number(base.aggregate.aggregate_version);const version=Number(base.version.version);
 const claim=async(commandType,actor,authorizationVersion,payload,key)=>{
  const command={commandType,requestId:uuid(100+aggregate),idempotencyKey:key,organizationId:base.org,workspaceId:base.workspace,actorId:actor,authorizationVersion,expectedAggregateVersion:aggregate,expectedArtifactVersion:version,payload};
  const result=(await stage(commandType,()=>db.query('SELECT public.studio_artifact_command_claim($1::jsonb) result',[JSON.stringify(command)]))).rows[0].result;assert.equal(result.outcome,'committed');aggregate++;return result;
 };
 await claim('studio.artifact.review.submit',base.requester,base.authorizationVersions[base.requester],{artifactId:base.artifactId,artifactVersionId:base.version.id},'private-submit');
 await claim('studio.artifact.review.assign',base.requester,base.authorizationVersions[base.requester],{artifactId:base.artifactId,artifactVersionId:base.version.id,reviewerId:base.reviewer},'private-assign');
 await claim('studio.artifact.review.resolve',base.reviewer,base.authorizationVersions[base.reviewer],{artifactId:base.artifactId,artifactVersionId:base.version.id,outcome:'approve',rationale:'fixture review',conditions:[]},'private-review');
 await claim('studio.artifact.approval.resolve',base.approver,base.authorizationVersions[base.approver],{artifactId:base.artifactId,artifactVersionId:base.version.id,outcome:'approve',rationale:'fixture approval',conditions:[]},'private-approve');
 const approved=await stage('approved exact version',()=>db.query("SELECT lifecycle FROM public.studio_artifact_versions WHERE id=$1::uuid AND artifact_id=$2::uuid",[base.version.id,base.artifactId]));assert.equal(approved.rows[0].lifecycle,'approved');
 return {...base,aggregateVersion:aggregate,artifactVersionId:base.version.id};
}
export async function createAvailablePrivateArtifactFixture(db,format='markdown',ordinal=200){
 const base=await createApprovedStudioFixture(db);const command={commandType:'studio.rendition.generate',actorId:base.requester,organizationId:base.org,workspaceId:base.workspace,requestId:uuid(ordinal),idempotencyKey:`private-render-${format}-${ordinal}`,authorizationVersion:base.authorizationVersions[base.requester],payload:{artifactVersionId:base.artifactVersionId,format}};
 const first=await privateCommand(db,command);assert.equal(first.outcome,'committed');assert.ok(first.renditionClaim);const attemptId=first.renditionClaim.attemptId;
 await stage('rendition attempt start',()=>db.query('SELECT public.studio_rendition_attempt_start($1::uuid)',[attemptId]));const extension=format==='markdown'?'md':format;const mime=format==='markdown'?'text/markdown; charset=utf-8':format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document';const objectKey=`${base.org}/${base.workspace}/studio-artifacts/${first.renditionClaim.opaqueObjectId}.${extension}`;const contentHash='a'.repeat(64);const safeFilename=`fixture.${extension}`;const renderer=first.renditionClaim.rendererVersion;const templateVersion=first.renditionClaim.templateVersion;const contentSchemaVersion=first.renditionClaim.contentSchemaVersion;
 await stage('rendition upload metadata',()=>db.query('SELECT public.studio_rendition_attempt_rendered($1::uuid,$2::text,$3::text,$4::bigint,$5::text,$6::text,$7::text,$8::text,$9::text)',[attemptId,objectKey,contentHash,128,mime,safeFilename,renderer,templateVersion,contentSchemaVersion]));
 const complete=(await stage('rendition completion',()=>db.query('SELECT public.studio_rendition_attempt_complete($1::uuid) result',[attemptId]))).rows[0].result;assert.equal(complete.outcome,'committed');
 const rendition=(await stage('rendition row',()=>db.query('SELECT * FROM public.studio_renditions WHERE id=$1::uuid',[complete.renditionId]))).rows[0];assert.equal(rendition.lifecycle,'available');return {...base,command,attemptId,rendition,objectKey,contentHash,mime,safeFilename,renderer};
}

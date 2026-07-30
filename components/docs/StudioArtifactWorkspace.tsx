import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { TenantContextProjection } from '../../types';
import { STUDIO_ARTIFACT_TYPES, type StudioArtifactProjectionDto, type StudioArtifactType, type StudioCommandResponse, type StudioCommandType } from '../../services/studioArtifacts/contracts';
import { executeStudioArtifactCommand, readStudioArtifact, readStudioEligibleReviewers, readStudioHandoffs, StudioArtifactBoundaryError, type StudioArtifactTransport, type StudioEligibleReviewer, type StudioHandoffOption } from '../../services/studioArtifacts/client';
import StudioArtifactRenditions from './StudioArtifactRenditions';

interface Props { context: TenantContextProjection; capabilities?: readonly string[]; online?: boolean; transport?: StudioArtifactTransport }
type ViewState='loading'|'empty'|'generating'|'generation_failed'|'draft'|'reviewer_ready'|'in_review'|'changes_requested'|'review_rejected'|'approval_ready'|'approved'|'approval_rejected'|'superseded'|'offline'|'stale'|'version_conflict'|'authorization_revoked'|'read_only'|'command_failed'|'committed_reload_failed';
const labels:Record<StudioArtifactProjectionDto['lifecycle'],string>={draft:'Draft',reviewer_ready:'Reviewer ready',in_review:'In review',changes_requested:'Changes requested',review_rejected:'Review rejected',approval_ready:'Approval ready',approved:'Approved',approval_rejected:'Approval rejected',superseded:'Superseded'};
const capability:Record<StudioCommandType,string>={'studio.artifact.generation.request':'studio.artifacts.generate','studio.artifact.draft.revise':'studio.artifacts.edit','studio.artifact.review.submit':'studio.artifacts.edit','studio.artifact.review.assign':'studio.artifacts.review','studio.artifact.review.resolve':'studio.artifacts.review','studio.artifact.approval.resolve':'studio.artifacts.approve'};
const stateForError=(error:unknown,generation=false):{state:ViewState;message:string}=>{
  if(!navigator.onLine)return{state:'offline',message:'Offline. No command was submitted.'};
  if(error instanceof StudioArtifactBoundaryError){
    if(error.code==='VERSION_CONFLICT')return{state:'version_conflict',message:'Version conflict. Reload the current committed state.'};
    if(error.code==='AUTHORITY_STALE'||error.code==='PERMISSION_DENIED')return{state:'authorization_revoked',message:'Authorization was revoked or became stale. Mutations are blocked.'};
    if(error.code==='READ_ONLY'||error.code==='FEATURE_DISABLED')return{state:'read_only',message:'Read-only maintenance. Committed canonical artifacts remain available.'};
    if(error.code==='GENERATION_FAILED')return{state:'generation_failed',message:'The committed generation attempt failed. No artifact version was created.'};
  }
  return{state:generation?'generation_failed':'command_failed',message:'Command failed before commit. No success was recorded.'};
};

export default function StudioArtifactWorkspace({context,capabilities=context.capabilities,online=true,transport}:Props){
  const [handoffs,setHandoffs]=useState<StudioHandoffOption[]>([]),[handoffId,setHandoffId]=useState('');
  const [artifactType,setArtifactType]=useState<StudioArtifactType>('brd'),[artifact,setArtifact]=useState<StudioArtifactProjectionDto|null>(null);
  const [state,setState]=useState<ViewState>('loading'),[message,setMessage]=useState('Loading committed Studio sources.');
  const [receipt,setReceipt]=useState<StudioCommandResponse|null>(null),[draft,setDraft]=useState(''),[reviewers,setReviewers]=useState<StudioEligibleReviewer[]>([]),[reviewerId,setReviewerId]=useState(''),[rationale,setRationale]=useState(''),[conditionsText,setConditionsText]=useState('');
  const offline=!online||!navigator.onLine, blocked=offline||state==='committed_reload_failed'||state==='authorization_revoked'||artifact?.readOnly===true;
  const conditions=useMemo(()=>conditionsText.split('\n').map(item=>item.trim()).filter(Boolean),[conditionsText]);
  const load=useCallback(async(selected=handoffId,type=artifactType)=>{
    if(offline){setState('offline');setMessage('Offline. Committed content remains visible; mutations are blocked.');return;}
    setState('loading');
    try{
      const sources=handoffs.length?handoffs:await readStudioHandoffs(context,transport);setHandoffs(sources);
      const id=selected||sources[0]?.id||'';setHandoffId(id);
      if(!id){setArtifact(null);setState('empty');setMessage('No accepted governed Studio handoffs are available.');return;}
      try{
        const value=await readStudioArtifact(context,id,type,transport);setArtifact(value);setState(value.readOnly?'read_only':value.lifecycle);setMessage(value.readOnly?'Read-only maintenance. Committed canonical artifacts remain available.':'Current committed artifact loaded.');
        if(['reviewer_ready','in_review'].includes(value.lifecycle)){
          const eligible=await readStudioEligibleReviewers(context,value.id,value.currentVersion.id,transport);setReviewers(eligible);setReviewerId(current=>eligible.some(x=>x.actorId===current)?current:(eligible[0]?.actorId??''));
        }else{setReviewers([]);setReviewerId('');}
      }catch(error){if(error instanceof StudioArtifactBoundaryError&&error.code==='RESOURCE_NOT_AVAILABLE'){setArtifact(null);setState('empty');setMessage('No canonical artifact exists for this source and type.');}else throw error;}
    }catch(error){const next=stateForError(error);setState(next.state==='command_failed'?'stale':next.state);setMessage(next.state==='command_failed'?'Studio authority is unavailable. Reload the current committed state.':next.message);}
  },[artifactType,context,handoffId,handoffs,offline,transport]);
  useEffect(()=>{void load();},[context.organizationId,context.workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps
  const run=async(commandType:StudioCommandType,payload:Record<string,unknown>)=>{
    if(blocked)return;if(offline){setState('offline');setMessage('Offline. No command was submitted.');return;}
    setState(commandType==='studio.artifact.generation.request'?'generating':'loading');setMessage('Submitting. Success appears only after commit and projection reload.');
    try{
      const result=await executeStudioArtifactCommand(context,commandType,artifact,payload,crypto.randomUUID(),transport);setReceipt(result);
      if(result.outcome==='generation_failed'){setState('generation_failed');setMessage(`Generation attempt committed (receipt ${result.receiptId}) and later failed. No artifact version was created.`);return;}
      try{const value=await readStudioArtifact(context,handoffId,artifactType,transport);setArtifact(value);setState(value.readOnly?'read_only':value.lifecycle);setMessage(`${labels[value.lifecycle]} committed.`);}
      catch{setState('committed_reload_failed');setMessage(`Command committed (receipt ${result.receiptId}), but projection reload failed. Mutations are blocked.`);}
    }catch(error){const next=stateForError(error,commandType==='studio.artifact.generation.request');setState(next.state);setMessage(next.message);}
  };
  const revise=()=>{try{const content=JSON.parse(draft) as unknown;if(!content||typeof content!=='object'||Array.isArray(content))throw new Error();void run('studio.artifact.draft.revise',{artifactId:artifact!.id,parentVersionId:artifact!.currentVersion.id,content});}catch{setState('command_failed');setMessage('Draft must be a structured JSON object. No command was submitted.');}};
  const can=(command:StudioCommandType)=>!blocked&&capabilities.includes(capability[command]);
  const exact=(...states:StudioArtifactProjectionDto['lifecycle'][])=>(artifact?states.includes(artifact.lifecycle):false);
  return <section data-testid="studio-artifact-workspace" aria-labelledby="studio-artifact-title" className="mt-6 rounded-3xl border-2 border-[#ffbc03]/50 p-4">
    <h2 id="studio-artifact-title" className="text-2xl font-black">Governed artifact workspace</h2><p className="mt-1 text-sm">Structured JSON is committed by server authority. Templates, schemas, ancestry and actors are never supplied by this browser.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="font-bold">Committed Studio handoff<select aria-label="Committed Studio handoff" value={handoffId} onChange={e=>{setHandoffId(e.target.value);void load(e.target.value,artifactType);}} className="mt-1 w-full rounded-xl border p-2">{handoffs.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="font-bold">Artifact type<select aria-label="Artifact type" value={artifactType} onChange={e=>{const type=e.target.value as StudioArtifactType;setArtifactType(type);void load(handoffId,type);}} className="mt-1 w-full rounded-xl border p-2">{STUDIO_ARTIFACT_TYPES.map(type=><option key={type} value={type}>{type.toUpperCase()}</option>)}</select></label></div>
    {offline&&<p role="alert" className="mt-3 rounded-xl bg-amber-50 p-3">Offline. Committed content remains visible; mutations are blocked.</p>}{(artifact?.readOnly||state==='read_only')&&<p role="status" className="mt-3 rounded-xl bg-blue-50 p-3">Read-only maintenance. Committed canonical artifacts remain available.</p>}
    <p role="status" aria-live="polite" className="mt-3 font-semibold">{message}</p>{state==='loading'&&<div aria-label="Loading Studio artifact" className="mt-3 animate-pulse rounded-xl bg-slate-100 p-8"/>}
    {state==='committed_reload_failed'&&<button onClick={()=>void load()} className="mt-3 rounded-xl bg-[#002C4B] px-3 py-2 font-bold text-white">Reload explicitly committed state</button>}
    {artifact&&<div className="mt-4 space-y-4"><header className="rounded-xl bg-[#002C4B] p-4 text-white"><strong>{artifact.artifactType.toUpperCase()} · {labels[artifact.lifecycle]}</strong><p>Aggregate v{artifact.aggregateVersion} · Content v{artifact.currentVersion.version}</p></header><pre className="max-h-80 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-white">{JSON.stringify(artifact.currentVersion.content,null,2)}</pre><details><summary className="font-bold">Immutable history</summary><ol>{[...artifact.versions].reverse().map(v=><li key={v.id}>Version {v.version} · {labels[v.lifecycle]} · {v.contentHash}</li>)}</ol></details>{artifact.currentApprovedVersion&&<p>Current approved version: {artifact.currentApprovedVersion.version}</p>}</div>}
    <div className="mt-4 grid gap-3"><label className="font-bold">Draft revision (strict structured JSON)<textarea value={draft} onChange={e=>setDraft(e.target.value)} rows={5} className="mt-1 w-full rounded-xl border p-2"/></label>{reviewers.length>0&&<label className="font-bold">Eligible independent reviewer<select aria-label="Eligible independent reviewer" value={reviewerId} onChange={e=>setReviewerId(e.target.value)} className="mt-1 w-full rounded-xl border p-2">{reviewers.map(person=><option key={person.actorId} value={person.actorId}>{person.displayName}</option>)}</select></label>}<label className="font-bold">Rationale<textarea value={rationale} onChange={e=>setRationale(e.target.value)} className="mt-1 w-full rounded-xl border p-2"/></label><label className="font-bold">Conditions (one bounded condition per line)<textarea value={conditionsText} onChange={e=>setConditionsText(e.target.value)} maxLength={10000} className="mt-1 w-full rounded-xl border p-2"/></label><div className="flex flex-wrap gap-2">
      <button disabled={!can('studio.artifact.generation.request')||state==='generating'||Boolean(artifact&&!['draft','changes_requested','review_rejected','approval_rejected','approved'].includes(artifact.lifecycle))} onClick={()=>void run('studio.artifact.generation.request',{studioHandoffId:handoffId,artifactType})} className="btn-primary disabled:opacity-50">Generate server draft</button>
      <button disabled={!can('studio.artifact.draft.revise')||!artifact||!draft||!exact('draft','changes_requested','review_rejected','approval_rejected')} onClick={revise} className="btn-ghost disabled:opacity-50">Commit immutable revision</button>
      <button disabled={!can('studio.artifact.review.submit')||!exact('draft')} onClick={()=>void run('studio.artifact.review.submit',{artifactId:artifact!.id,artifactVersionId:artifact!.currentVersion.id})} className="btn-ghost disabled:opacity-50">Submit exact version for review</button>
      <button disabled={!can('studio.artifact.review.assign')||!exact('reviewer_ready')||!reviewerId} onClick={()=>void run('studio.artifact.review.assign',{artifactId:artifact!.id,artifactVersionId:artifact!.currentVersion.id,reviewerId})} className="btn-ghost disabled:opacity-50">Assign independent reviewer</button>
      <button disabled={!can('studio.artifact.review.resolve')||!exact('in_review')||!rationale} onClick={()=>void run('studio.artifact.review.resolve',{artifactId:artifact!.id,artifactVersionId:artifact!.currentVersion.id,outcome:'approve',rationale,conditions})} className="btn-ghost disabled:opacity-50">Approve review</button>
      <button disabled={!can('studio.artifact.review.resolve')||!exact('in_review')||!rationale} onClick={()=>void run('studio.artifact.review.resolve',{artifactId:artifact!.id,artifactVersionId:artifact!.currentVersion.id,outcome:'changes_requested',rationale,conditions})} className="btn-ghost disabled:opacity-50">Request changes</button>
      <button disabled={!can('studio.artifact.review.resolve')||!exact('in_review')||!rationale} onClick={()=>void run('studio.artifact.review.resolve',{artifactId:artifact!.id,artifactVersionId:artifact!.currentVersion.id,outcome:'reject',rationale,conditions})} className="btn-ghost disabled:opacity-50">Reject review</button>
      <button disabled={!can('studio.artifact.approval.resolve')||!exact('approval_ready')||!rationale} onClick={()=>void run('studio.artifact.approval.resolve',{artifactId:artifact!.id,artifactVersionId:artifact!.currentVersion.id,outcome:'approve',rationale,conditions})} className="btn-ghost disabled:opacity-50">Final approve</button>
      <button disabled={!can('studio.artifact.approval.resolve')||!exact('approval_ready')||!rationale} onClick={()=>void run('studio.artifact.approval.resolve',{artifactId:artifact!.id,artifactVersionId:artifact!.currentVersion.id,outcome:'reject',rationale,conditions})} className="btn-ghost disabled:opacity-50">Final reject</button>
    </div></div>
    {artifact?.currentApprovedVersion?<StudioArtifactRenditions context={context} artifact={artifact} capabilities={capabilities} online={online}/>:<p className="mt-5 rounded-xl border p-3 font-bold">Private export and governed download are not available in this release. This restriction applies only to this non-approved artifact version; approved canonical Studio versions use the governed private-rendition controls.</p>}{receipt&&<p className="sr-only">Last committed receipt {receipt.receiptId}; resource {receipt.resourceId}</p>}
  </section>;
}

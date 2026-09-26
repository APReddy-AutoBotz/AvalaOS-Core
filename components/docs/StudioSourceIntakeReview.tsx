import React, { useMemo, useState } from 'react';
import { bytesToBase64, STUDIO_SOURCE_MIME_TYPES } from '../../services/enterpriseIntelligenceClient';
import {
  studioDirectPackageEligibility,
  type StudioSourceFlowBundle,
  type StudioSourceFlowCandidate,
  type StudioSourceFlowProjection,
} from '../../services/studioArtifacts/workspaceModel';

type UploadInput={displayName:string;sourceKind:'upload'|'pasted_text';filename:string;mimeType:string;contentBase64:string};
type ReviewInput={candidate:StudioSourceFlowCandidate;status:'accepted'|'rejected'|'edited';value?:string;reason?:string};
interface Props {
  key?:React.Key;
  projection:StudioSourceFlowProjection;
  disabled?:boolean;
  canManageSources:boolean;
  selectedBundleVersionId:string;
  onSelectBundle:(versionId:string)=>void;
  onCreateSource:(input:UploadInput)=>Promise<{status:'review'|'failed';failureCode?:string}>;
  onExtract:(bundle:StudioSourceFlowBundle)=>Promise<void>;
  onReview:(input:ReviewInput)=>Promise<void>;
}

const MAX_SOURCE_BYTES=12_000_000;
const FILE_TYPES:{extensions:readonly string[];mimeType:typeof STUDIO_SOURCE_MIME_TYPES[number]}[]=[
  {extensions:['.txt'],mimeType:'text/plain'},
  {extensions:['.md','.markdown'],mimeType:'text/markdown'},
  {extensions:['.csv'],mimeType:'text/csv'},
  {extensions:['.vtt'],mimeType:'text/vtt'},
  {extensions:['.srt'],mimeType:'application/x-subrip'},
  {extensions:['.pdf'],mimeType:'application/pdf'},
  {extensions:['.docx'],mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},
];
const sourceFileType=(file:File)=>{
  const name=file.name.toLocaleLowerCase();
  const extensionType=FILE_TYPES.find(item=>item.extensions.some(extension=>name.endsWith(extension)))?.mimeType;
  if(extensionType){
    const declared=file.type.trim().toLocaleLowerCase();
    return !declared||declared==='application/octet-stream'||declared===extensionType?extensionType:null;
  }
  return STUDIO_SOURCE_MIME_TYPES.includes(file.type as typeof STUDIO_SOURCE_MIME_TYPES[number])
    ? file.type as typeof STUDIO_SOURCE_MIME_TYPES[number]
    : null;
};

export default function StudioSourceIntakeReview({projection,disabled,canManageSources,selectedBundleVersionId,onSelectBundle,onCreateSource,onExtract,onReview}:Props){
  const [pendingFile,setPendingFile]=useState<{name:string;mimeType:string;size:number;contentBase64:string}|null>(null);
  const [pasteName,setPasteName]=useState('Studio workshop notes');
  const [pasteText,setPasteText]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('Upload or paste a bounded Studio-owned text source. Raw content is never returned in the browser projection.');
  const [editing,setEditing]=useState<{candidateId:string;mode:'edited'|'rejected';value:string;reason:string}|null>(null);
  const visibleBundleVersionId=selectedBundleVersionId||(!projection.featureState.sourceMutationsEnabled?projection.inputBundles.find(bundle=>bundle.status==='locked')?.versionSelector??'':'');
  const selectedBundle=projection.inputBundles.find(bundle=>bundle.versionSelector===visibleBundleVersionId);
  const latestJob=useMemo(()=>projection.extractionJobs.filter(job=>job.inputBundleVersionId===visibleBundleVersionId).sort((left,right)=>Date.parse(right.createdAt)-Date.parse(left.createdAt))[0],[projection.extractionJobs,visibleBundleVersionId]);
  const candidates=useMemo(()=>latestJob?projection.candidates.filter(candidate=>candidate.extractionJobId===latestJob.id):[],[latestJob,projection.candidates]);
  const eligibility=studioDirectPackageEligibility(projection,visibleBundleVersionId);
  const mutationsEnabled=projection.featureState.sourceMutationsEnabled&&canManageSources&&!disabled;
  const extractionEnabled=mutationsEnabled&&projection.featureState.providerExtractionEnabled;
  const act=async(work:()=>Promise<void>,success:string)=>{setBusy(true);setMessage('Committing. Success appears only after the exact server projection reloads.');try{await work();setMessage(success);return true;}catch{setMessage('The governed command failed or its committed projection could not be verified. No success is claimed.');return false;}finally{setBusy(false);}};
  const selectFile=async(file?:File)=>{
    setPendingFile(null);
    if(!file)return;
    const mimeType=sourceFileType(file);
    if(!mimeType){setMessage('Unsupported or mismatched Studio source. Use TXT, Markdown, CSV, VTT, SRT, text-based PDF, or DOCX.');return;}
    if(file.size<1||file.size>MAX_SOURCE_BYTES){setMessage('Studio sources must contain data and be no larger than 12 MB.');return;}
    try{const bytes=new Uint8Array(await file.arrayBuffer());setPendingFile({name:file.name,mimeType,size:file.size,contentBase64:bytesToBase64(bytes)});setMessage(`${file.name} is ready to store as a private immutable Studio source.`);}catch{setMessage('The selected file could not be read. No source was uploaded.');}
  };
  const uploadFile=async()=>{if(!pendingFile)return;setBusy(true);setMessage('Storing the private source. Success appears only after the exact server projection reloads.');try{const result=await onCreateSource({displayName:pendingFile.name,sourceKind:'upload',filename:pendingFile.name,mimeType:pendingFile.mimeType,contentBase64:pendingFile.contentBase64});setPendingFile(null);setMessage(result.status==='failed'?`The immutable source was retained, but bounded parsing failed (${result.failureCode?.replaceAll('_',' ')||'source failure'}). It is not selectable.`:'Private immutable Studio source stored and reloaded.');}catch{setMessage('The source command failed or its committed projection could not be verified. No upload success is claimed.');}finally{setBusy(false);}};
  const uploadPaste=async()=>{const name=pasteName.trim(),value=pasteText.trim();if(!name||!value)return;const bytes=new TextEncoder().encode(value);if(bytes.length>MAX_SOURCE_BYTES){setMessage('Pasted Studio text must be no larger than 12 MB.');return;}setBusy(true);setMessage('Storing the pasted source. Success appears only after the exact server projection reloads.');try{const result=await onCreateSource({displayName:name,sourceKind:'pasted_text',filename:`${name.replace(/[^a-z0-9_-]+/giu,'-').replace(/^-+|-+$/gu,'').slice(0,200)||'studio-notes'}.txt`,mimeType:'text/plain',contentBase64:bytesToBase64(bytes)});setPasteText('');setMessage(result.status==='failed'?`The immutable pasted source was retained, but bounded parsing failed (${result.failureCode?.replaceAll('_',' ')||'source failure'}). It is not selectable.`:'Private pasted Studio source stored and reloaded.');}catch{setMessage('The pasted-source command failed or its committed projection could not be verified. No upload success is claimed.');}finally{setBusy(false);}};
  const review=async(candidate:StudioSourceFlowCandidate,status:'accepted'|'rejected'|'edited',value?:string,reason?:string)=>{const saved=await act(()=>onReview({candidate,status,value,reason}),status==='accepted'?'Candidate accepted and exact review projection reloaded.':status==='edited'?'Edited candidate and rationale committed and reloaded.':'Candidate rejection and rationale committed and reloaded.');if(saved)setEditing(null);};
  const reasonLabel=projection.featureState.reason?.replaceAll('_',' ')??'';

  return <section aria-labelledby="studio-source-intake-title" className="av-surface mt-4 p-4">
    <p className="av-eyebrow">Independent Studio inputs</p><h3 id="studio-source-intake-title" className="mt-1 text-lg font-bold">Upload, extract, and review Studio sources</h3>
    <p className="mt-2 text-sm font-semibold text-[var(--av-color-text-muted)]">Studio sources are independent from Assess. AI suggestions remain untrusted until a human accepts or edits them; AI cannot approve the document or change deterministic decisions.</p>
    <p className="mt-1 text-xs font-semibold text-[var(--av-color-text-muted)]">PDF support is text-layer only; image-only scans are retained with a bounded parse failure. OCR is not performed. DOCX body text is extracted by the governed server parser.</p>
    <p role="status" aria-live="polite" className="mt-3 rounded-lg bg-[var(--av-color-bg-subtle)] p-3 text-sm font-semibold">{message}</p>
    {!projection.featureState.sourceMutationsEnabled?<p role="status" className="mt-2 text-sm font-bold text-amber-800">Studio source mutations are unavailable{reasonLabel?`: ${reasonLabel}`:''}. Existing committed records remain readable.</p>:null}
    <details open className="mt-4 rounded-xl border border-[var(--av-color-border)] p-3"><summary className="cursor-pointer font-bold">1. Add a private text source</summary>
      <div className="mt-3 grid gap-4 lg:grid-cols-2"><div><label className="av-form-label" htmlFor="studio-source-file">Studio source file<input id="studio-source-file" type="file" accept=".txt,.md,.markdown,.csv,.vtt,.srt,.pdf,.docx" disabled={!mutationsEnabled||busy} onChange={event=>void selectFile(event.target.files?.[0])} className="mt-2 block w-full text-sm" /></label>{pendingFile?<><p className="mt-2 break-all text-xs font-semibold">{pendingFile.name} · {Math.ceil(pendingFile.size/1024)} KB</p><button type="button" disabled={!mutationsEnabled||busy} onClick={()=>void uploadFile()} className="btn-primary mt-2 min-h-10 px-3 text-sm font-bold disabled:opacity-50">Store private Studio source</button></>:null}</div>
      <div><label className="av-form-label">Pasted source name<input value={pasteName} maxLength={240} disabled={!mutationsEnabled||busy} onChange={event=>setPasteName(event.target.value)} className="av-input mt-2" /></label><label className="av-form-label mt-3">Pasted Studio text<textarea value={pasteText} maxLength={2_000_000} rows={5} disabled={!mutationsEnabled||busy} onChange={event=>setPasteText(event.target.value)} className="av-input mt-2 resize-y" /></label><p className="mt-1 text-xs font-semibold">{pasteText.length.toLocaleString()}/2,000,000 characters</p><button type="button" disabled={!mutationsEnabled||busy||!pasteName.trim()||!pasteText.trim()} onClick={()=>void uploadPaste()} className="btn-primary mt-2 min-h-10 px-3 text-sm font-bold disabled:opacity-50">Store pasted Studio source</button></div></div>
    </details>
    <details open className="mt-4 rounded-xl border border-[var(--av-color-border)] p-3"><summary className="cursor-pointer font-bold">2. Extract an exact locked bundle</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><label className="av-form-label">Exact locked Studio bundle<select aria-label="Exact Studio bundle for extraction" value={visibleBundleVersionId} disabled={!mutationsEnabled||busy} onChange={event=>onSelectBundle(event.target.value)} className="av-input mt-2"><option value="">Select exact bundle</option>{projection.inputBundles.filter(bundle=>bundle.status==='locked').map(bundle=><option key={bundle.versionSelector} value={bundle.versionSelector}>{bundle.label} · {bundle.versionLabel} · {bundle.sourceCount} sources</option>)}</select></label><button type="button" disabled={!extractionEnabled||busy||!selectedBundle} onClick={()=>selectedBundle&&void act(()=>onExtract(selectedBundle),'Governed Studio extraction committed and exact candidates reloaded.')} className="btn-primary self-end min-h-10 px-3 text-sm font-bold disabled:opacity-50">Run governed Studio extraction</button></div>
      {!projection.featureState.providerExtractionEnabled?<p role="status" className="mt-2 text-sm font-bold text-amber-800">Provider extraction is unavailable{reasonLabel?`: ${reasonLabel}`:''}. No provider call will be attempted.</p>:null}
      {latestJob?<p className="mt-3 text-sm font-semibold" role="status">Latest extraction: {latestJob.status} · {latestJob.bindingCount} exact source bindings · {latestJob.candidateCount} candidates.</p>:null}
    </details>
    <details open className="mt-4 rounded-xl border border-[var(--av-color-border)] p-3"><summary className="cursor-pointer font-bold">3. Review every grounded candidate</summary>
      <p className={`mt-3 rounded-lg p-3 text-sm font-bold ${eligibility.eligible?'bg-emerald-50 text-emerald-900':'bg-amber-50 text-amber-900'}`} role="status">{eligibility.message}</p>
      <div className="mt-3 grid gap-3">{candidates.map(candidate=><article key={`${candidate.id}:${candidate.candidateVersion}`} aria-labelledby={`studio-candidate-${candidate.id}`} className="rounded-xl border border-[var(--av-color-border)] p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><h4 id={`studio-candidate-${candidate.id}`} className="font-bold">{candidate.field}</h4><p className="mt-1 text-xs font-semibold text-[var(--av-color-text-muted)]">{candidate.sourceLabel} · {candidate.sourceVersionLabel} · {Math.round(candidate.confidence*100)}% AI confidence</p></div><div className="flex flex-wrap gap-2"><span className="rounded-full border px-2 py-1 text-[10px] font-black uppercase">{candidate.provenanceState==='anchored'?'Grounding verified':'Grounding incomplete'}</span><span className="rounded-full border px-2 py-1 text-[10px] font-black uppercase">{candidate.status.replaceAll('_',' ')}</span></div></div><p className="mt-3 break-words text-sm font-semibold">{candidate.value}</p><blockquote className="mt-2 border-l-2 border-[var(--av-color-border-strong)] pl-3 text-xs font-semibold text-[var(--av-color-text-muted)]">{candidate.safeExcerpt||'No browser-safe excerpt supplied.'}<span className="mt-1 block">Location: {candidate.sourceLocator}</span></blockquote>{candidate.provenanceState!=='anchored'?<p role="alert" className="mt-2 text-xs font-bold text-amber-800">This candidate lacks complete source anchoring. It cannot be accepted or edited into package coverage.</p>:null}
        {editing?.candidateId===candidate.id?<div role="group" aria-label={`Review ${candidate.field}`} className="mt-3 rounded-lg bg-[var(--av-color-bg-subtle)] p-3">{editing.mode==='edited'?<label className="av-form-label">Reviewed value<textarea value={editing.value} maxLength={12000} rows={4} onChange={event=>setEditing(current=>current?{...current,value:event.target.value}:current)} className="av-input mt-2 resize-y" /></label>:null}<label className="av-form-label mt-3">Review rationale<input value={editing.reason} maxLength={2000} onChange={event=>setEditing(current=>current?{...current,reason:event.target.value}:current)} className="av-input mt-2" /></label><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy||editing.reason.trim().length<4||(editing.mode==='edited'&&(!editing.value.trim()||candidate.provenanceState!=='anchored'))} onClick={()=>void review(candidate,editing.mode,editing.mode==='edited'?editing.value:undefined,editing.reason)} className="btn-primary min-h-10 px-3 text-sm font-bold disabled:opacity-50">Commit {editing.mode==='edited'?'reviewed edit':'rejection'}</button><button type="button" disabled={busy} onClick={()=>setEditing(null)} className="btn-ghost min-h-10 px-3 text-sm font-bold">Cancel</button></div></div>:<div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={!mutationsEnabled||busy||candidate.status==='accepted'||candidate.provenanceState!=='anchored'} onClick={()=>void review(candidate,'accepted')} className="btn-primary min-h-10 px-3 text-sm font-bold disabled:opacity-50">Accept</button><button type="button" disabled={!mutationsEnabled||busy||candidate.provenanceState!=='anchored'} onClick={()=>setEditing({candidateId:candidate.id,mode:'edited',value:candidate.value,reason:''})} className="btn-ghost min-h-10 px-3 text-sm font-bold disabled:opacity-50">Edit</button><button type="button" disabled={!mutationsEnabled||busy||candidate.status==='rejected'} onClick={()=>setEditing({candidateId:candidate.id,mode:'rejected',value:'',reason:''})} className="btn-ghost min-h-10 px-3 text-sm font-bold disabled:opacity-50">Reject</button></div>}
      </article>)}</div>
      {visibleBundleVersionId&&!candidates.length?<p role="status" className="mt-3 text-sm font-semibold text-[var(--av-color-text-muted)]">No candidates are available for this exact bundle. Run extraction or review the reported failure state.</p>:null}
    </details>
  </section>;
}

// Provider transport is exercised with deterministic fetch fakes by the aggregate Edge gate.
import { callStudioArtifactProvider } from './studioArtifactProvider.ts';
const assert=(v:unknown,m:string)=>{if(!v)throw new Error(m)};
void(async()=>{
 (globalThis as typeof globalThis & {Deno:{env:{get:(key:string)=>string|undefined}}}).Deno={env:{get:key=>key==='GROQ_MODEL'?'fake-model':undefined}};
 const prior=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({title:'T',summary:'S',sections:[]})}}]}),{status:200,headers:{'content-type':'application/json'}});
 try{const result=await callStudioArtifactProvider({provider:'groq',apiKey:'fake',sourcePackage:{accepted:true},template:'immutable',artifactType:'brd'});assert(typeof result.content==='object','deterministic provider JSON parsed');globalThis.fetch=async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({title:'T',summary:'S',sections:[]})}]}}]}),{status:200,headers:{'content-type':'application/json'}});assert(typeof (await callStudioArtifactProvider({provider:'gemini',apiKey:'fake',sourcePackage:{accepted:true},template:'immutable',artifactType:'frd'})).content==='object','gemini JSON parsed');let rejected=false;try{await callStudioArtifactProvider({provider:'groq',apiKey:'fake',sourcePackage:{value:'x'.repeat(800_001)},template:'immutable',artifactType:'pdd'})}catch{rejected=true}assert(rejected,'oversized source rejected');}finally{globalThis.fetch=prior}
 console.log('studio artifact provider tests passed (3 scenarios)');
})().catch(error=>{console.error(error);throw error});

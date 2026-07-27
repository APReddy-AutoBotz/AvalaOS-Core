import { validateStudioDraft } from './studioArtifactGeneration.ts';
const assert=(v:unknown,m:string)=>{if(!v)throw new Error(m)};
const valid={title:'Requirements',summary:'A governed draft.',sections:[{title:'Scope',content:'Bounded content'}]};
assert(validateStudioDraft(valid)===valid,'valid strict draft accepted');
for(const invalid of [{...valid,html:'<script>'},{...valid,sections:[]},{...valid,sections:[{title:'x',content:'y',authority:'client'}]},{title:'x',summary:'x',sections:[{title:'x',content:'x'.repeat(20_001)}]}]){let failed=false;try{validateStudioDraft(invalid)}catch{failed=true}assert(failed,'untrusted output rejected');}
console.log('studio artifact generation validation tests passed (5 scenarios)');

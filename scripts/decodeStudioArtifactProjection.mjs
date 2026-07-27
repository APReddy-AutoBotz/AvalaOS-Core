import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ts from 'typescript';

const [file,organizationId,workspaceId]=process.argv.slice(2);
if(!file||!organizationId||!workspaceId)throw Error('projection file and tenant context are required');
// Execute the production decoder implementation itself.  Its transport import
// is removed because this bridge deliberately tests database JSON, not HTTP.
const source=(await readFile('services/studioArtifacts/client.ts','utf8'))
 .replace(/import type \{ TenantContextProjection \} from '[^']+';/,'')
 .replace("import { supabase } from '../supabaseClient';",'const supabase = undefined;')
 .replace(/import \{[\s\S]*?\} from '\.\/contracts';/,"const STUDIO_ARTIFACT_LIFECYCLES=['draft','reviewer_ready','in_review','changes_requested','review_rejected','approval_ready','approved','approval_rejected','superseded']; const STUDIO_ARTIFACT_TYPES=['brd','frd','pdd'];");
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const dir=await mkdtemp(join(tmpdir(),'studio-decoder-'));
try{
 const moduleFile=join(dir,'client.mjs');await writeFile(moduleFile,compiled);
 const {decodeStudioArtifactProjection}=await import(`file://${moduleFile}`);
 const decoded=decodeStudioArtifactProjection(JSON.parse(await readFile(file,'utf8')),{organizationId,workspaceId});
 if(decoded.ancestry.organizationId!==organizationId||decoded.ancestry.workspaceId!==workspaceId)throw Error('production decoder tenant mismatch');
 console.log(`Studio production decoder bridge passed: ${decoded.id}`);
}finally{await rm(dir,{recursive:true,force:true})}

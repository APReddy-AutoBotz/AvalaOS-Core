import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const roots = [
  'types.ts','services/assessV2ClientContract.ts',
  'services/assessV2/types.ts','services/assessV2/canonical.ts','services/assessV2/reviewDomain.ts','services/assessV2/reviewDomain.test.ts',
  'services/assessV2ReviewClientContract.ts',
  'supabase/functions/_shared/tenantAuthority.ts','supabase/functions/_shared/assessV2ReviewCommand.ts','supabase/functions/_shared/assessV2ReviewCommand.test.ts',
];
const outputDir=path.resolve('.agent/pr1e-coverage');fs.rmSync(outputDir,{recursive:true,force:true});fs.mkdirSync(outputDir,{recursive:true});fs.writeFileSync(path.join(outputDir,'package.json'),JSON.stringify({type:'commonjs'}));
const program=ts.createProgram({rootNames:roots,options:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,moduleResolution:ts.ModuleResolutionKind.Node10,skipLibCheck:true,outDir:outputDir,noEmit:false,esModuleInterop:true,rewriteRelativeImportExtensions:true,lib:['lib.es2022.d.ts','lib.dom.d.ts']}});
const diagnostics=ts.getPreEmitDiagnostics(program);if(diagnostics.length){console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:x=>x,getCurrentDirectory:()=>process.cwd(),getNewLine:()=>'\n'}));process.exit(1);}if(program.emit().emitSkipped)process.exit(1);
const slash=value=>path.join(outputDir,value).replace(/\\/g,'/');
const tests=['services/assessV2/reviewDomain.test.js','supabase/functions/_shared/assessV2ReviewCommand.test.js'].map(slash);
const includes=['services/assessV2/reviewDomain.js','supabase/functions/_shared/assessV2ReviewCommand.js'].map(slash);
const result=spawnSync(process.execPath,['--experimental-test-coverage','--test-coverage-lines=90','--test-coverage-functions=85','--test-coverage-branches=80',...includes.map(x=>`--test-coverage-include=${x}`),'--test',...tests],{stdio:'inherit'});process.exit(result.status??1);

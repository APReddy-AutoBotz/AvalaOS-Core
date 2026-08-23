import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';

const rootNames=process.argv.slice(2);
const testEntry=rootNames.at(-1);
const out=path.resolve('.agent/pr1f-ts-tests');
fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'package.json'),JSON.stringify({type:'commonjs'}));
const options={
  target:ts.ScriptTarget.ES2022,
  module:ts.ModuleKind.CommonJS,
  moduleResolution:ts.ModuleResolutionKind.Node10,
  skipLibCheck:true,
  outDir:out,
  noEmit:false,
  esModuleInterop:true,
  rewriteRelativeImportExtensions:true,
  jsx:ts.JsxEmit.ReactJSX,
};
const host=ts.createCompilerHost(options);
const readFile=host.readFile.bind(host);
const supabaseClient=path.resolve('services/supabaseClient.ts');
host.readFile=file=>path.resolve(file)===supabaseClient
  ? "export const supabase:any={functions:{invoke:async(...args:any[])=>{const f=(globalThis as any).__studioInvoke;if(!f)throw new Error('UNEXPECTED_LIVE_TRANSPORT');return f(...args)}},rpc:async(...args:any[])=>{const f=(globalThis as any).__studioRpc;if(!f)throw new Error('UNEXPECTED_LIVE_TRANSPORT');return f(...args)}};"
  : readFile(file);
const program=ts.createProgram({rootNames,options,host});
const diagnostics=ts.getPreEmitDiagnostics(program);
if(diagnostics.length){
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:file=>file,getCurrentDirectory:()=>process.cwd(),getNewLine:()=>"\n"}));
  process.exit(1);
}
if(program.emit().emitSkipped)process.exit(1);
const candidates=[
  path.join(out,testEntry.replace(/\.tsx?$/,'.js')),
  path.join(out,path.basename(testEntry).replace(/\.tsx?$/,'.js')),
];
const compiled=candidates.find(fs.existsSync);
if(!compiled)throw new Error(`compiled test not found for ${testEntry}`);
execFileSync(process.execPath,[compiled],{stdio:'inherit'});

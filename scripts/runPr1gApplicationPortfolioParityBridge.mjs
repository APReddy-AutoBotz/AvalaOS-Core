import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const args=process.argv.slice(2);
if(args.length!==1)throw new Error('Usage: runPr1gApplicationPortfolioParityBridge.mjs <json-path>');
const outputDir=path.resolve('.agent/pr1g-parity-bridge');
fs.rmSync(outputDir,{recursive:true,force:true});
fs.mkdirSync(outputDir,{recursive:true});
fs.writeFileSync(path.join(outputDir,'package.json'),JSON.stringify({type:'commonjs'}));
const options={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,moduleResolution:ts.ModuleResolutionKind.Node10,skipLibCheck:true,outDir:outputDir,noEmit:false,esModuleInterop:true,rewriteRelativeImportExtensions:true};
const root='scripts/pr1gApplicationPortfolioParityBridge.ts';
const program=ts.createProgram({rootNames:[root],options});
const diagnostics=ts.getPreEmitDiagnostics(program);
if(diagnostics.length){
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:file=>file,getCurrentDirectory:()=>process.cwd(),getNewLine:()=>'\n'}));
  process.exit(1);
}
if(program.emit().emitSkipped)process.exit(1);
execFileSync(process.execPath,[path.join(outputDir,'scripts/pr1gApplicationPortfolioParityBridge.js'),...args],{stdio:'inherit'});

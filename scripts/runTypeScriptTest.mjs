import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const rootNames = process.argv.slice(2);
if (rootNames.length === 0) {
  console.error('Usage: node scripts/runTypeScriptTest.mjs <source.ts> [test.ts]');
  process.exit(1);
}

const testEntry = rootNames[rootNames.length - 1];
const outputDir = path.resolve('.agent/ts-tests');
fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2));

const program = ts.createProgram({
  rootNames,
  options: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    skipLibCheck: true,
    outDir: outputDir,
    noEmit: false,
    esModuleInterop: true,
    rewriteRelativeImportExtensions: true,
  },
});

const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length > 0) {
  const message = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: fileName => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  });
  console.error(message);
  process.exit(1);
}

const result = program.emit();
if (result.emitSkipped) {
  console.error('TypeScript regression compilation failed.');
  process.exit(1);
}

const compiledEntry = path.join(outputDir, testEntry.replace(/\.ts$/, '.js'));
execFileSync(process.execPath, [compiledEntry], {
  stdio: 'inherit',
});

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const rootNames = process.argv.slice(2);
if (rootNames.length < 2) throw new Error('Usage: node scripts/runEnterpriseIntelligenceTest.mjs <source.ts> [test.ts]');
const testEntry = rootNames.at(-1);
const outputDir = path.resolve('.agent/enterprise-intelligence-tests');
fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'package.json'), JSON.stringify({ type: 'module' }));

const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ES2022,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  skipLibCheck: true,
  outDir: outputDir,
  noEmit: false,
  esModuleInterop: true,
  rewriteRelativeImportExtensions: true,
};
const program = ts.createProgram({ rootNames, options });
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: fileName => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  }));
  process.exit(1);
}
if (program.emit().emitSkipped) throw new Error('Enterprise Intelligence TypeScript compilation failed.');

const rewriteLocalModuleSpecifiers = directory => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) rewriteLocalModuleSpecifiers(target);
    if (!entry.isFile() || !target.endsWith('.js')) continue;
    const source = fs.readFileSync(target, 'utf8');
    const rewritten = source.replace(/(['"])(\.\.?\/[^'"\r\n]+?)(\1)/g, (full, quote, specifier) => {
      if (/\.(?:js|json|mjs|cjs|ts)$/.test(specifier)) return full;
      return `${quote}${specifier}.js${quote}`;
    });
    if (rewritten !== source) fs.writeFileSync(target, rewritten);
  }
};
rewriteLocalModuleSpecifiers(outputDir);
const candidates = [
  path.join(outputDir, testEntry.replace(/\.ts$/, '.js')),
  path.join(outputDir, path.basename(testEntry).replace(/\.ts$/, '.js')),
];
const compiled = candidates.find(fs.existsSync);
if (!compiled) throw new Error(`Compiled test not found for ${testEntry}`);
execFileSync(process.execPath, ['--experimental-specifier-resolution=node', compiled], { stdio: 'inherit' });

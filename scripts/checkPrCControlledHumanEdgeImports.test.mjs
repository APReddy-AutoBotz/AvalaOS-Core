import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectEdgeImportGraph, checkRequiredEdgeImports, CONTROLLED_HUMAN_EDGE_FUNCTIONS } from './checkPrCControlledHumanEdgeImports.mjs';
import { buildRequiredEdgeSourceManifest, REQUIRED_EDGE_FUNCTIONS } from './prCControlledHumanEvidenceContract.mjs';

const entry = 'supabase/functions/assess-command/index.ts';
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'pr264-import-graph-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (name, value) => {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), value);
  };
  for (const name of CONTROLLED_HUMAN_EDGE_FUNCTIONS) write(`supabase/functions/${name}/index.ts`, 'export const synthetic = true;\n');
  return { root, write };
}

test('canonical nine actual graphs resolve without execution or network claims', () => {
  assert.deepEqual(REQUIRED_EDGE_FUNCTIONS, CONTROLLED_HUMAN_EDGE_FUNCTIONS);
  const report = checkRequiredEdgeImports(process.cwd());
  assert.equal(report.evidenceClass, 'local_source_resolution_only');
  assert.deepEqual(report.functions.map(item => item.name), REQUIRED_EDGE_FUNCTIONS);
  assert(report.functions.every(item => item.sourceCount > 0 && /^sha256:[a-f0-9]{64}$/u.test(item.graphDigest)));
  for (const [name, source] of [['assess-command', 'services/scoringEngine.ts'], ['enterprise-intelligence-command', 'services/enterpriseIntelligence.ts']]) {
    assert(collectEdgeImportGraph(process.cwd(), `supabase/functions/${name}/index.ts`).some(item => item.path === source));
  }
});

test('external transitive dependencies, type imports, reexports and cycles are exact and deterministic', t => {
  const { root, write } = fixture(t);
  write(entry, "import type { T } from '../../../services/shared.ts'; export * from '../../../services/shared.ts'; const x = import('../../../services/shared.ts');\n");
  write('services/shared.ts', "export type T = import('../types.ts').T;\n");
  write('types.ts', "import type { T as U } from './services/shared.ts'; export type T = string;\n");
  const graph = collectEdgeImportGraph(root, entry);
  assert.deepEqual(graph.map(item => item.path), ['services/shared.ts', entry, 'types.ts']);
  assert.deepEqual(graph.find(item => item.path === entry).imports, ['services/shared.ts']);
  assert.deepEqual(collectEdgeImportGraph(root, entry), graph);
});

test('AST traversal ignores fake imports in comments and literal strings', t => {
  const { root, write } = fixture(t);
  write(entry, '// import "https://bad.invalid/x.ts"\nconst example = "import a from \'../missing\'";\n');
  assert.equal(collectEdgeImportGraph(root, entry).length, 1);
});

for (const [label, source, code] of [
  ['retained extensionless scoring dependency', "import type { T } from '../../../types';", 'SPECIFIER_REJECTED'],
  ['extensionless runtime dependency', "export * from '../../../services/contracts';", 'SPECIFIER_REJECTED'],
  ['nonliteral dynamic import', 'const file = "./x.ts"; import(file);', 'DYNAMIC_REJECTED'],
  ['remote import', 'import "https://bad.invalid/a.ts";', 'SPECIFIER_REJECTED'],
  ['npm import', 'import "npm:synthetic";', 'SPECIFIER_REJECTED'],
  ['bare import', 'import "synthetic";', 'SPECIFIER_REJECTED'],
  ['query substitution', 'import "./x.ts?key=synthetic";', 'SPECIFIER_REJECTED'],
  ['percent-encoded path', 'import "./%78.ts";', 'SPECIFIER_REJECTED'],
  ['external traversal', 'import "../../../../outside.ts";', 'PATH_REJECTED'],
  ['protected user directory', 'import "../../../tools/private.ts";', 'PATH_REJECTED'],
  ['require execution', 'require("./x.ts");', 'REQUIRE_REJECTED'],
  ['require declaration', 'import x = require("./x.ts");', 'REQUIRE_REJECTED'],
  ['triple slash reference', '/// <reference path="../../../types.ts" />\nexport {};', 'REFERENCE_REJECTED'],
  ['parse failure', 'import { broken;', 'SYNTAX_REJECTED'],
  ['missing source', 'import "./missing.ts";', 'SOURCE_MISSING'],
]) {
  test(`fail-closed: ${label}`, t => {
    const { root, write } = fixture(t);
    write(entry, source);
    assert.throws(() => collectEdgeImportGraph(root, entry), { message: `PR_C_EDGE_IMPORT_${code}` });
  });
}

test('exact function set rejects omission, duplication, substitution, ordering and additions', t => {
  const { root } = fixture(t);
  for (const names of [REQUIRED_EDGE_FUNCTIONS.slice(1), [...REQUIRED_EDGE_FUNCTIONS, 'extra'], [...REQUIRED_EDGE_FUNCTIONS].reverse(), REQUIRED_EDGE_FUNCTIONS.map((name, i) => i === 0 ? 'other' : name), REQUIRED_EDGE_FUNCTIONS.map((name, i) => i === 0 ? REQUIRED_EDGE_FUNCTIONS[1] : name)]) {
    assert.throws(() => checkRequiredEdgeImports(root, names), { message: 'PR_C_EDGE_IMPORT_FUNCTION_SET' });
  }
});

test('bounded source and graph size reject before unbounded traversal', t => {
  const { root, write } = fixture(t);
  write(entry, ' '.repeat(2 * 1024 * 1024 + 1));
  assert.throws(() => collectEdgeImportGraph(root, entry), { message: 'PR_C_EDGE_IMPORT_SOURCE_LIMIT' });
  write(entry, "import '../../../services/chain0.ts';");
  for (let i = 0; i < 256; i++) write(`services/chain${i}.ts`, i === 255 ? 'export {};' : `import './chain${i + 1}.ts';`);
  assert.throws(() => collectEdgeImportGraph(root, entry), { message: 'PR_C_EDGE_IMPORT_GRAPH_LIMIT' });
});

test('symlink or junction cannot substitute source directory', t => {
  const { root, write } = fixture(t);
  write('other/private.ts', 'export {};');
  symlinkSync(path.join(root, 'other'), path.join(root, 'services'), 'junction');
  write(entry, "import '../../../services/private.ts';");
  assert.throws(() => collectEdgeImportGraph(root, entry), { message: 'PR_C_EDGE_IMPORT_PATH_REJECTED' });
});

test('deployed source manifest changes when an external service or transitive type changes', t => {
  const { root, write } = fixture(t);
  write(entry, "import type { T } from '../../../services/shared.ts';");
  write('services/shared.ts', "export type { T } from '../types.ts';");
  write('types.ts', 'export type T = string;');
  const before = buildRequiredEdgeSourceManifest(root);
  write('types.ts', 'export type T = number;');
  const after = buildRequiredEdgeSourceManifest(root);
  assert.notEqual(after[0].sourceDigest, before[0].sourceDigest);
  assert.deepEqual(after.slice(1), before.slice(1));
  write('services/shared.ts', "export type { T } from '../types.ts'; export type Extra = boolean;");
  assert.notEqual(buildRequiredEdgeSourceManifest(root)[0].sourceDigest, after[0].sourceDigest);
});

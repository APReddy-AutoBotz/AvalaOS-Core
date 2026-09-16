import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { rewriteTestModuleSpecifiers } from './rewriteTestModuleSpecifiers.mjs';

test('only actual extensionless module syntax is rewritten', () => {
  const source = `import value from './module'; export { x } from "../shared"; import('./lazy');`;
  assert.equal(rewriteTestModuleSpecifiers(source), `import value from "./module.js"; export { x } from "../shared.js"; import("./lazy.js");`);
});
test('fixture strings, comments, templates, URLs and existing extensions remain exact', () => {
  const source = `const traversal='../evil.xml'; const relative='./fixture'; const source="import x from './pretend'";
  // import x from './comment'
  const template=\`../literal\`; import './real.js'; export * from '../already.mjs'; import('./data.json'); import('node:fs');`;
  assert.equal(rewriteTestModuleSpecifiers(source), source);
});
test('computed imports and non-import calls are not guessed or changed', () => {
  const source = "load('./module'); require('../legacy'); import('./dynamic-' + name); import(`./template`); import('./module?query');";
  assert.equal(rewriteTestModuleSpecifiers(source), source);
});

test('app typecheck excludes disposable compiler output without excluding real source', () => {
  const root = '/virtual-assess';
  const tree = new Map([
    [root, { files: [], directories: ['components', 'services', 'scripts', 'output'] }],
    [`${root}/components`, { files: ['Assess.tsx'], directories: [] }],
    [`${root}/services`, { files: ['mapping.ts'], directories: [] }],
    [`${root}/scripts`, { files: ['runner.mjs'], directories: [] }],
    [`${root}/output`, { files: [], directories: ['test-runs'] }],
    [`${root}/output/test-runs`, { files: [], directories: ['enterprise-intelligence'] }],
    [`${root}/output/test-runs/enterprise-intelligence`, { files: [], directories: ['run-fixture'] }],
    [`${root}/output/test-runs/enterprise-intelligence/run-fixture`, { files: ['generated.js'], directories: [] }],
  ]);
  const host = {
    useCaseSensitiveFileNames: true,
    fileExists: () => false,
    readFile: () => undefined,
    readDirectory: (directory, extensions, excludes, includes, depth) => ts.matchFiles(
      directory, extensions, excludes, includes, true, root, depth,
      path => tree.get(path) || { files: [], directories: [] }, path => path,
    ),
  };
  const config = JSON.parse(readFileSync(new URL('../tsconfig.json', import.meta.url), 'utf8'));
  const parsed = ts.parseJsonConfigFileContent(config, host, root);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.fileNames.sort(), [
    `${root}/components/Assess.tsx`, `${root}/scripts/runner.mjs`, `${root}/services/mapping.ts`,
  ]);
  const mutated = ts.parseJsonConfigFileContent({ ...config,
    exclude: config.exclude.filter(path => path !== 'output/test-runs'),
  }, host, root);
  assert.equal(mutated.fileNames.includes(`${root}/output/test-runs/enterprise-intelligence/run-fixture/generated.js`), true,
    'removing the generated-output exclusion must reproduce the unsafe discovery');
});

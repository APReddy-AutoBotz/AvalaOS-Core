import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import {
  collectReferencedRepositoryMjs,
  copyReferencedRepositoryMjs,
} from './typescriptRuntimeMjsGraph.mjs';

const root = process.cwd();
const fixtureRoot = path.join(root, '.agent', 'run-pr1a-coverage-selftest');
const outputRoot = path.join(root, '.agent', 'run-pr1a-coverage-selftest-output');
const compilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  outDir: outputRoot,
  noEmit: false,
};

const write = (relative, value) => {
  const destination = path.join(fixtureRoot, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, value);
  return destination;
};

const programFor = source => ts.createProgram({ rootNames: [source], options: compilerOptions });

test('PR 1A coverage runtime graph copies only exact referenced and transitive .mjs modules', () => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  fs.rmSync(outputRoot, { recursive: true, force: true });
  try {
    const source = write('positive/source.ts', "import { value } from './helper.mjs';\nexport { value };\n");
    write('positive/helper.mjs', "import { nested } from './nested.mjs';\nexport const value = nested + 1;\n");
    write('positive/nested.mjs', 'export const nested = 41;\n');
    write('positive/unreferenced.mjs', "throw new Error('must not be copied');\n");
    const copies = collectReferencedRepositoryMjs({ program: programFor(source), projectRoot: root });
    copyReferencedRepositoryMjs({ copies, outputDir: outputRoot });

    const emittedFixture = path.relative(root, path.join(fixtureRoot, 'positive'));
    assert.equal(copies.length, 2);
    assert.equal(fs.existsSync(path.join(outputRoot, emittedFixture, 'helper.mjs')), true);
    assert.equal(fs.existsSync(path.join(outputRoot, emittedFixture, 'nested.mjs')), true);
    assert.equal(fs.existsSync(path.join(outputRoot, emittedFixture, 'unreferenced.mjs')), false);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

test('PR 1A coverage runtime graph rejects missing, absolute, and escaping modules', () => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  try {
    const missing = write('missing/source.ts', "import './missing.mjs';\n");
    assert.throws(
      () => collectReferencedRepositoryMjs({ program: programFor(missing), projectRoot: root }),
      /Required local [.]mjs module does not exist/u,
    );

    const absolute = write('absolute/source.ts', "import 'C:/substituted/outside.mjs';\n");
    assert.throws(
      () => collectReferencedRepositoryMjs({ program: programFor(absolute), projectRoot: root }),
      /Absolute [.]mjs module specifiers are not permitted/u,
    );

    const escaping = write('escaping/source.ts', "import '../../../../../../outside.mjs';\n");
    assert.throws(
      () => collectReferencedRepositoryMjs({ program: programFor(escaping), projectRoot: root }),
      /must resolve to a file inside the repository/u,
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('PR 1A coverage runtime graph rejects symlink or junction substitution', t => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  try {
    const canonicalDirectory = path.join(fixtureRoot, 'canonical');
    const substitutedDirectory = path.join(fixtureRoot, 'substituted');
    fs.mkdirSync(canonicalDirectory, { recursive: true });
    fs.writeFileSync(path.join(canonicalDirectory, 'helper.mjs'), 'export const value = 42;\n');
    try {
      fs.symlinkSync(canonicalDirectory, substitutedDirectory, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      t.skip(`filesystem cannot create a local symlink/junction: ${error.code ?? 'unknown'}`);
      return;
    }
    const source = write('source.ts', "import { value } from './substituted/helper.mjs';\nexport { value };\n");
    assert.throws(
      () => collectReferencedRepositoryMjs({ program: programFor(source), projectRoot: root }),
      /cannot resolve through a substituted path/u,
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

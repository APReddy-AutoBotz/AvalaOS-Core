import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./supabaseClient.ts', import.meta.url), 'utf8');
const match = source.match(/export const isSyntheticBrowserLoopbackServerConfiguration = \([\s\S]*?\n\};/u);
assert.ok(match, 'synthetic loopback boundary must remain directly testable');
const compiled = ts.transpileModule(match[0], {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const module = { exports: {} };
new Function('exports', 'module', 'isSafePublicSupabaseCredential', compiled)(
  module.exports,
  module,
  value => typeof value === 'string' && /^sb_publishable_[A-Za-z0-9_-]{20,}$/u.test(value),
);
const accepts = module.exports.isSyntheticBrowserLoopbackServerConfiguration;
const publicKey = 'sb_publishable_enterprise_lifecycle_browser_test';

test('internal synthetic build accepts only an exact HTTP IPv4 loopback origin with a safe public key', () => {
  assert.equal(accepts('http://127.0.0.1:54321', publicKey, true), true);
  assert.equal(accepts('http://127.0.0.1:54321/', publicKey, true), true);
  assert.equal(accepts('https://127.0.0.1:59999', publicKey, true), true);
  for (const rejected of [
    ' http://127.0.0.1:54321',
    'http://localhost:54321',
    'http://127.1:54321',
    'http://2130706433:54321',
    'http://0x7f000001:54321',
    'https://127.0.0.1:54321',
    'http://127.0.0.1',
    'http://127.0.0.1:54321/path',
    'http://127.0.0.1:54321?query=yes',
    'http://user@127.0.0.1:54321',
    'http://127.0.0.2:54321',
    'http://example.test:54321',
  ]) assert.equal(accepts(rejected, publicKey, true), false, rejected);
  assert.equal(accepts({ toString: () => 'http://127.0.0.1:54321' }, publicKey, true), false);
});

test('ordinary builds and unsafe credentials cannot activate the loopback server boundary', () => {
  assert.equal(accepts('http://127.0.0.1:54321', publicKey, false), false);
  assert.equal(accepts('http://127.0.0.1:54321', 'service-role-secret', true), false);
});

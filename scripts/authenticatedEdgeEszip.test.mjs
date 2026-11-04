import assert from 'node:assert/strict';
import { brotliCompressSync } from 'node:zlib';
import test from 'node:test';

import { authenticatedEdgeEszipMetadataSuffix, decodeAuthenticatedEdgeEszip,
  parseAuthenticatedEdgeEszip } from './authenticatedEdgeEszip.mjs';

const entrypoint = 'functions/fixture/index.ts';
const sharedSpecifier = 'functions/fixture/shared.ts';
const originalEntry = "import { value } from './shared.ts';\nexport default value;\n";
const originalShared = 'export const value = 1;\n';
const emittedEntry = "import { value } from './shared.ts';\nexport default value;\n";
const emittedShared = 'export const value = 1;\n';
const markerJson = JSON.stringify({ import_map: null, jsr_pkgs: [], package_jsons: {}, pkg_json_resolution: 'Enabled' });

const u32 = value => { const bytes = Buffer.alloc(4); bytes.writeUInt32BE(value); return bytes; };
const section = bytes => Buffer.concat([u32(bytes.length), bytes]);
const string = value => { const bytes = Buffer.from(value); return Buffer.concat([u32(bytes.length), bytes]); };
const map = (specifier, source) => Buffer.from(JSON.stringify({
  version: 3, sources: [specifier], sourcesContent: [source], names: [], mappings: 'AAAA',
}));

function buildFixture({ modules: replacement, options = Buffer.from([0, 0, 1, 0]), magic = 'ESZIP2.3', trailing = Buffer.alloc(0) } = {}) {
  const modules = replacement ?? [
    { specifier: entrypoint, source: Buffer.from(emittedEntry), sourceMap: map(entrypoint, originalEntry), kind: 0 },
    { specifier: sharedSpecifier, source: Buffer.from(emittedShared), sourceMap: map(sharedSpecifier, originalShared), kind: 0 },
    { specifier: '---SUPABASE-ESZIP-VERSION-ESZIP---', source: Buffer.from('2.0'), sourceMap: Buffer.alloc(0), kind: 3 },
    { specifier: '---EDGE-RUNTIME-METADATA---',
      source: Buffer.concat([Buffer.from(`${entrypoint}${markerJson}`),
        authenticatedEdgeEszipMetadataSuffix(entrypoint,'supabase')]), sourceMap: Buffer.alloc(0), kind: 3 },
  ];
  const sources = []; const maps = []; const header = []; let sourceOffset = 0; let mapOffset = 0;
  for (const module of modules) {
    header.push(string(module.specifier), Buffer.from([0]), u32(module.source.length ? sourceOffset : 0), u32(module.source.length),
      u32(module.sourceMap.length ? mapOffset : 0), u32(module.sourceMap.length), Buffer.from([module.kind]));
    sources.push(module.source); maps.push(module.sourceMap); sourceOffset += module.source.length; mapOffset += module.sourceMap.length;
  }
  return Buffer.concat([Buffer.from(magic), section(options), section(Buffer.concat(header)), section(Buffer.alloc(0)),
    section(Buffer.concat(sources)), section(Buffer.concat(maps)), trailing]);
}

const expectedSources = () => new Map([
  [entrypoint, { bytes: Buffer.from(originalEntry), normalizedRelative: 'fixture/index.ts' }],
  [sharedSpecifier, { bytes: Buffer.from(originalShared), normalizedRelative: 'fixture/shared.ts' }],
]);
const parseFixture = (expanded, options = {}) => parseAuthenticatedEdgeEszip(expanded, {
  expectedSources: expectedSources(), entrypoint, opaqueStrings: ['supabase'], ...options,
});

test('bounded Brotli ESZIP2.3 recovers exact original source inputs', async () => {
  const expanded = buildFixture(); const compressed = brotliCompressSync(expanded);
  assert.deepEqual(await decodeAuthenticatedEdgeEszip(compressed), expanded);
  const originals = parseFixture(expanded);
  assert.equal(originals.size, 2); assert.equal(originals.get(entrypoint).toString(), originalEntry);
});

test('Brotli decoding rejects trailing compressed bytes and expanded overflow', async () => {
  const compressed = brotliCompressSync(buildFixture());
  await assert.rejects(decodeAuthenticatedEdgeEszip(Buffer.concat([compressed, Buffer.from([1])])),
    /BACKEND_SOURCE_ESZIP_TRAILING_COMPRESSED_REJECTED/u);
  await assert.rejects(decodeAuthenticatedEdgeEszip(compressed, { maxExpandedBytes: 8 }),
    /BACKEND_SOURCE_ESZIP_SIZE_REJECTED/u);
  await assert.rejects(decodeAuthenticatedEdgeEszip(Buffer.from('not-brotli')),
    /BACKEND_SOURCE_ESZIP_BROTLI_REJECTED/u);
});

for (const [label, fixture, code] of [
  ['version', () => buildFixture({ magic: 'ESZIP2.2' }), 'VERSION_REJECTED'],
  ['options', () => buildFixture({ options: Buffer.from([0, 1, 1, 32]) }), 'OPTIONS_REJECTED'],
  ['archive trailing bytes', () => buildFixture({ trailing: Buffer.from([0]) }), 'TRAILING_REJECTED'],
]) test(`ESZIP parser rejects unsupported ${label}`, () => {
  assert.throws(() => parseFixture(fixture()),
    new RegExp(`BACKEND_SOURCE_ESZIP_${code}`, 'u'));
});

test('ESZIP parser rejects duplicate and unsafe module identities', () => {
  const base = [
    { specifier: entrypoint, source: Buffer.from(emittedEntry), sourceMap: map(entrypoint, originalEntry), kind: 0 },
    { specifier: entrypoint, source: Buffer.from(emittedShared), sourceMap: map(entrypoint, originalShared), kind: 0 },
  ];
  assert.throws(() => parseFixture(buildFixture({ modules: base })), /BACKEND_SOURCE_ESZIP_DUPLICATE_REJECTED/u);
  base[1] = { ...base[1], specifier: '../escape.ts' };
  assert.throws(() => parseFixture(buildFixture({ modules: base })), /BACKEND_SOURCE_ESZIP_PATH_REJECTED/u);
});

test('ESZIP parser rejects stale source-map input and emitted dependency expansion', () => {
  const staleExpected = expectedSources(); staleExpected.get(entrypoint).bytes = Buffer.from('export default 0;\n');
  assert.throws(() => parseFixture(buildFixture(), { expectedSources: staleExpected }),
    /BACKEND_SOURCE_ESZIP_SOURCE_FILE_MISMATCH/u);
  const bad = buildFixture({ modules: [
    { specifier: entrypoint, source: Buffer.from("import './outside.ts';\n"), sourceMap: map(entrypoint, originalEntry), kind: 0 },
    { specifier: sharedSpecifier, source: Buffer.from(emittedShared), sourceMap: map(sharedSpecifier, originalShared), kind: 0 },
    { specifier: '---SUPABASE-ESZIP-VERSION-ESZIP---', source: Buffer.from('2.0'), sourceMap: Buffer.alloc(0), kind: 3 },
    { specifier: '---EDGE-RUNTIME-METADATA---', source: Buffer.concat([Buffer.from(`${entrypoint}${markerJson}`),
      authenticatedEdgeEszipMetadataSuffix(entrypoint,'supabase')]), sourceMap: Buffer.alloc(0), kind: 3 },
  ] });
  assert.throws(() => parseFixture(bad),
    /BACKEND_SOURCE_ESZIP_EMITTED_IMPORT_REJECTED/u);
});

test('ESZIP parser rejects missing, changed or extra opaque runtime markers', () => {
  const expanded = buildFixture();
  const changed = Buffer.from(expanded); changed[changed.indexOf(Buffer.from('2.0')) + 2] = 0x31;
  assert.throws(() => parseFixture(changed),
    /BACKEND_SOURCE_ESZIP_OPAQUE_REJECTED/u);
  const suffix=authenticatedEdgeEszipMetadataSuffix(entrypoint,'supabase');suffix[suffix.length-1]^=1;
  const javascript=[
    {specifier:entrypoint,source:Buffer.from(emittedEntry),sourceMap:map(entrypoint,originalEntry),kind:0},
    {specifier:sharedSpecifier,source:Buffer.from(emittedShared),sourceMap:map(sharedSpecifier,originalShared),kind:0},
  ];
  const version={specifier:'---SUPABASE-ESZIP-VERSION-ESZIP---',source:Buffer.from('2.0'),sourceMap:Buffer.alloc(0),kind:3};
  const metadata={specifier:'---EDGE-RUNTIME-METADATA---',
    source:Buffer.concat([Buffer.from(`${entrypoint}${markerJson}`),suffix]),sourceMap:Buffer.alloc(0),kind:3};
  assert.throws(()=>parseFixture(buildFixture({modules:[...javascript,version,metadata]})),
    /BACKEND_SOURCE_ESZIP_OPAQUE_REJECTED/u);
  assert.throws(()=>parseFixture(buildFixture({modules:[...javascript,version]})),
    /BACKEND_SOURCE_ESZIP_OPAQUE_REJECTED/u);
  assert.throws(()=>parseFixture(buildFixture({modules:[...javascript,version,metadata,
    {specifier:'---UNKNOWN---',source:Buffer.alloc(0),sourceMap:Buffer.alloc(0),kind:3}]})),
  /BACKEND_SOURCE_ESZIP_OPAQUE_REJECTED/u);
});

test('ESZIP parser rejects noncontiguous source offsets and malformed source maps', () => {
  const expanded = buildFixture(); const offset = 8 + 4 + 4 + 4 + 4 + Buffer.byteLength(entrypoint) + 1;
  const shifted = Buffer.from(expanded); shifted.writeUInt32BE(1, offset);
  assert.throws(() => parseFixture(shifted),
    /BACKEND_SOURCE_ESZIP_OFFSET_REJECTED/u);
  const malformed = buildFixture({ modules: [
    { specifier: entrypoint, source: Buffer.from(emittedEntry), sourceMap: Buffer.from('{}'), kind: 0 },
    { specifier: sharedSpecifier, source: Buffer.from(emittedShared), sourceMap: map(sharedSpecifier, originalShared), kind: 0 },
    { specifier: '---SUPABASE-ESZIP-VERSION-ESZIP---', source: Buffer.from('2.0'), sourceMap: Buffer.alloc(0), kind: 3 },
    { specifier: '---EDGE-RUNTIME-METADATA---', source: Buffer.concat([Buffer.from(`${entrypoint}${markerJson}`),
      authenticatedEdgeEszipMetadataSuffix(entrypoint,'supabase')]), sourceMap: Buffer.alloc(0), kind: 3 },
  ] });
  assert.throws(() => parseFixture(malformed),
    /BACKEND_SOURCE_ESZIP_SOURCE_MAP_REJECTED/u);
});

import { createBrotliDecompress } from 'node:zlib';
import path from 'node:path';
import ts from 'typescript';

export const AUTHENTICATED_EDGE_ESZIP_MAX_EXPANDED_BYTES = 64 * 1024 * 1024;
const MAX_MODULES = 2048;
const MAX_SPECIFIER_BYTES = 2048;
const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
const MAX_SOURCE_MAP_BYTES = 16 * 1024 * 1024;
const MAGIC = Buffer.from('ESZIP2.3');
const OPTIONS = Buffer.from([0, 0, 1, 0]);
const VERSION_MARKER = '---SUPABASE-ESZIP-VERSION-ESZIP---';
const METADATA_MARKER = '---EDGE-RUNTIME-METADATA---';
const METADATA_JSON = JSON.stringify({ import_map: null, jsr_pkgs: [], package_jsons: {}, pkg_json_resolution: 'Enabled' });
const UTF8 = new TextDecoder('utf-8', { fatal: true });
const normalizeCrlf = input => Buffer.from(input).toString('utf8').replace(/\r\n/gu, '\n');

const reject = code => { throw new Error(`BACKEND_SOURCE_ESZIP_${code}`); };
const safeAdd = (left, right) => {
  const sum = left + right;
  if (!Number.isSafeInteger(sum) || sum < left) reject('INTEGER_REJECTED');
  return sum;
};

class Cursor {
  constructor(bytes) { this.bytes = Buffer.from(bytes); this.offset = 0; }
  take(length, code = 'TRUNCATED') {
    if (!Number.isSafeInteger(length) || length < 0 || safeAdd(this.offset, length) > this.bytes.length) reject(code);
    const value = this.bytes.subarray(this.offset, this.offset + length); this.offset += length; return value;
  }
  u32(code) { return this.take(4, code).readUInt32BE(0); }
  section(maximum, code) {
    const length = this.u32(code);
    if (length > maximum) reject('SIZE_REJECTED');
    return this.take(length, code);
  }
  done() { return this.offset === this.bytes.length; }
}

export async function decodeAuthenticatedEdgeEszip(compressed, { maxExpandedBytes = AUTHENTICATED_EDGE_ESZIP_MAX_EXPANDED_BYTES } = {}) {
  const input = Buffer.from(compressed);
  if (!input.length || !Number.isSafeInteger(maxExpandedBytes) || maxExpandedBytes < 1) reject('SIZE_REJECTED');
  return new Promise((resolve, rejectPromise) => {
    const decoder = createBrotliDecompress(); const chunks = []; let expanded = 0; let settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; error ? rejectPromise(error) : resolve(value); };
    decoder.on('data', chunk => {
      expanded = safeAdd(expanded, chunk.length);
      if (expanded > maxExpandedBytes) decoder.destroy(new Error('BACKEND_SOURCE_ESZIP_SIZE_REJECTED'));
      else chunks.push(Buffer.from(chunk));
    });
    decoder.once('error', error => finish(/^BACKEND_SOURCE_ESZIP_[A-Z_]+$/u.test(error?.message ?? '')
      ? error : new Error('BACKEND_SOURCE_ESZIP_BROTLI_REJECTED')));
    decoder.once('end', () => {
      if (decoder.bytesWritten !== input.length) return finish(new Error('BACKEND_SOURCE_ESZIP_TRAILING_COMPRESSED_REJECTED'));
      finish(null, Buffer.concat(chunks, expanded));
    });
    decoder.end(input);
  });
}

const parseString = bytes => {
  let value; try { value = UTF8.decode(bytes); } catch { reject('UTF8_REJECTED'); }
  if (!value || value.includes('\\') || /[\u0000-\u001f\u007f]/u.test(value)
    || path.posix.isAbsolute(value) || path.posix.normalize(value) !== value
    || value.split('/').some(segment => !segment || segment === '.' || segment === '..')) reject('PATH_REJECTED');
  return value;
};

const parseHeader = header => {
  const cursor = new Cursor(header); const modules = []; const names = new Set();
  while (!cursor.done()) {
    if (modules.length >= MAX_MODULES) reject('MODULE_COUNT_REJECTED');
    const specifierLength = cursor.u32('HEADER_REJECTED');
    if (!specifierLength || specifierLength > MAX_SPECIFIER_BYTES) reject('PATH_REJECTED');
    const specifier = parseString(cursor.take(specifierLength, 'HEADER_REJECTED'));
    if (names.has(specifier)) reject('DUPLICATE_REJECTED'); names.add(specifier);
    if (cursor.take(1, 'HEADER_REJECTED')[0] !== 0) reject('ENTRY_KIND_REJECTED');
    const sourceOffset = cursor.u32('HEADER_REJECTED'); const sourceLength = cursor.u32('HEADER_REJECTED');
    const sourceMapOffset = cursor.u32('HEADER_REJECTED'); const sourceMapLength = cursor.u32('HEADER_REJECTED');
    const kind = cursor.take(1, 'HEADER_REJECTED')[0];
    if (![0, 3].includes(kind) || sourceLength > MAX_SOURCE_BYTES || sourceMapLength > MAX_SOURCE_MAP_BYTES) reject('MODULE_KIND_REJECTED');
    if ((sourceLength === 0 && sourceOffset !== 0) || (sourceMapLength === 0 && sourceMapOffset !== 0)) reject('OFFSET_REJECTED');
    modules.push({ specifier, sourceOffset, sourceLength, sourceMapOffset, sourceMapLength, kind });
  }
  return modules;
};

const attachSection = (modules, bytes, offsetKey, lengthKey, outputKey) => {
  const ranged = modules.filter(module => module[lengthKey] > 0).toSorted((left, right) => left[offsetKey] - right[offsetKey]);
  let offset = 0;
  for (const module of ranged) {
    if (module[offsetKey] !== offset) reject('OFFSET_REJECTED');
    const end = safeAdd(offset, module[lengthKey]); if (end > bytes.length) reject('OFFSET_REJECTED');
    module[outputKey] = bytes.subarray(offset, end); offset = end;
  }
  if (offset !== bytes.length) reject('OFFSET_REJECTED');
  for (const module of modules) if (!module[outputKey]) module[outputKey] = Buffer.alloc(0);
};

const parseSourceMap = (module, expected) => {
  if (!module.sourceMap.length) reject('SOURCE_MAP_REJECTED');
  let map; try { map = JSON.parse(UTF8.decode(module.sourceMap)); } catch { reject('SOURCE_MAP_REJECTED'); }
  if (!map || Array.isArray(map) || Object.keys(map).toSorted().join('|') !== 'mappings|names|sources|sourcesContent|version'
    || map.version !== 3 || !Array.isArray(map.names) || map.names.length !== 0
    || typeof map.mappings !== 'string' || map.mappings.length > MAX_SOURCE_MAP_BYTES
    || !Array.isArray(map.sources) || map.sources.length !== 1 || map.sources[0] !== module.specifier
    || !Array.isArray(map.sourcesContent) || map.sourcesContent.length !== 1 || typeof map.sourcesContent[0] !== 'string') {
    reject('SOURCE_MAP_REJECTED');
  }
  const original = Buffer.from(normalizeCrlf(map.sourcesContent[0]), 'utf8');
  if (normalizeCrlf(original) !== normalizeCrlf(expected.bytes)) reject('SOURCE_FILE_MISMATCH');
  return original;
};

const emittedSpecifiers = (specifier, source) => {
  let text; try { text = UTF8.decode(source); } catch { reject('EMITTED_REJECTED'); }
  const tree = ts.createSourceFile(specifier, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (tree.parseDiagnostics.length) reject('EMITTED_REJECTED');
  const found = [];
  const add = node => {
    if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node)) reject('EMITTED_IMPORT_REJECTED');
    found.push(node.text);
  };
  const visit = node => {
    if (ts.isImportDeclaration(node) || (ts.isExportDeclaration(node) && node.moduleSpecifier)) add(node.moduleSpecifier);
    else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      if (node.arguments.length !== 1) reject('EMITTED_IMPORT_REJECTED'); add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree); return found;
};

const verifyEmittedImports = (modules, expectedNames) => {
  for (const module of modules) {
    if (module.kind !== 0 || !module.source.length) reject('EMITTED_REJECTED');
    for (const dependency of emittedSpecifiers(module.specifier, module.source)) {
      if (!dependency.startsWith('./') && !dependency.startsWith('../')) reject('EMITTED_IMPORT_REJECTED');
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(module.specifier), dependency));
      if (resolved.startsWith('../') || !expectedNames.has(resolved)) reject('EMITTED_IMPORT_REJECTED');
    }
  }
};

export const authenticatedEdgeEszipMetadataSuffix = (entrypoint, opaqueString) => {
  const entrypointLength = Buffer.byteLength(entrypoint, 'utf8');
  const functionsLayout = /^functions\/[a-z0-9]+(?:-[a-z0-9]+)*\/index[.]ts$/u.test(entrypoint);
  const repositoryLayout = /^source\/supabase\/functions\/[a-z0-9]+(?:-[a-z0-9]+)*\/index[.]ts$/u.test(entrypoint);
  if ((!functionsLayout && !repositoryLayout) || entrypointLength > MAX_SPECIFIER_BYTES
    || (functionsLayout && opaqueString !== 'supabase')
    || (repositoryLayout
      && !/^user_fn_[a-z0-9]{20}_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_[1-9][0-9]*$/u.test(opaqueString))) {
    return null;
  }
  const identity = Buffer.from(opaqueString, 'ascii');
  if (!identity.length || identity.length > MAX_SPECIFIER_BYTES) return null;
  const workspaceLength = Buffer.byteLength(METADATA_JSON, 'utf8');
  const prefixLength = safeAdd(entrypointLength, workspaceLength);
  const identityPadding = (4 - (prefixLength % 4)) % 4;
  const identityOffset = safeAdd(prefixLength, identityPadding);
  const identityEnd = safeAdd(identityOffset, identity.length);
  const archivePadding = (8 - (identityEnd % 8)) % 8;
  const archiveOffset = safeAdd(identityEnd, archivePadding);
  // Reconstruct the closed rkyv 0.7 archive emitted for edge-runtime Metadata:
  // entrypoint Option<Key(String)>, workspace-resolver Option<Vec<u8>>,
  // virtual-dir Option<{ name: String, entries: [] }>, then the remaining
  // empty Metadata fields. The 4/8-byte alignment and relative pointers follow
  // supabase/edge-runtime crates/deno_facade/{metadata.rs,eszip/mod.rs}.
  const words = [
    1, 0, entrypointLength, -(archiveOffset + 8),
    1, entrypointLength - (archiveOffset + 20), workspaceLength,
    1, 0,
    identityOffset - archiveOffset - 36,
    identityOffset - archiveOffset - 40,
    identityOffset - archiveOffset - 44,
    0, 1, identity.length,
    identityOffset - archiveOffset - 56,
    -64,
    ...Array(13).fill(0),
  ];
  const archivedMetadata = Buffer.alloc(words.length * 4);
  words.forEach((word, index) => archivedMetadata.writeInt32LE(word, index * 4));
  return Buffer.concat([Buffer.alloc(identityPadding), identity, Buffer.alloc(archivePadding), archivedMetadata]);
};

const verifyOpaqueMarkers = (modules, layout) => {
  const opaque = new Map(modules.filter(module => module.kind === 3).map(module => [module.specifier, module]));
  if (opaque.size !== 2 || !opaque.has(VERSION_MARKER) || !opaque.has(METADATA_MARKER)) reject('OPAQUE_REJECTED');
  const version = opaque.get(VERSION_MARKER); const metadata = opaque.get(METADATA_MARKER);
  if (version.sourceMap.length || version.source.toString('utf8') !== '2.0' || metadata.sourceMap.length) reject('OPAQUE_REJECTED');
  const prefix = Buffer.from(`${layout.entrypoint}${METADATA_JSON}`);
  const suffix = metadata.source.subarray(prefix.length);
  const expectedSuffix=authenticatedEdgeEszipMetadataSuffix(layout.entrypoint,layout.opaqueStrings?.[0]);
  if (!expectedSuffix || metadata.source.length < prefix.length
    || !metadata.source.subarray(0, prefix.length).equals(prefix)
    || !suffix.equals(expectedSuffix)) reject('OPAQUE_REJECTED');
};

const validLayout = layout => layout && layout.expectedSources instanceof Map
  && layout.expectedSources.size >= 1 && layout.expectedSources.size <= MAX_MODULES
  && typeof layout.entrypoint === 'string' && layout.expectedSources.has(layout.entrypoint)
  && Array.isArray(layout.opaqueStrings) && layout.opaqueStrings.length === 1
  && typeof layout.opaqueStrings[0] === 'string' && layout.opaqueStrings[0].length >= 3
  && layout.opaqueStrings[0].length <= MAX_SPECIFIER_BYTES;

export function parseAuthenticatedEdgeEszip(expanded, { expectedSources, entrypoint, opaqueStrings, layouts } = {}) {
  const candidates = layouts ?? [{ expectedSources, entrypoint, opaqueStrings }];
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > 2 || candidates.some(layout => !validLayout(layout))) {
    reject('INPUT_REJECTED');
  }
  const cursor = new Cursor(expanded);
  if (!cursor.take(MAGIC.length).equals(MAGIC)) reject('VERSION_REJECTED');
  if (!cursor.section(256, 'OPTIONS_REJECTED').equals(OPTIONS)) reject('OPTIONS_REJECTED');
  const modules = parseHeader(cursor.section(AUTHENTICATED_EDGE_ESZIP_MAX_EXPANDED_BYTES, 'HEADER_REJECTED'));
  if (cursor.section(AUTHENTICATED_EDGE_ESZIP_MAX_EXPANDED_BYTES, 'NPM_REJECTED').length) reject('NPM_REJECTED');
  const sources = cursor.section(AUTHENTICATED_EDGE_ESZIP_MAX_EXPANDED_BYTES, 'SOURCES_REJECTED');
  const sourceMaps = cursor.section(AUTHENTICATED_EDGE_ESZIP_MAX_EXPANDED_BYTES, 'SOURCE_MAP_REJECTED');
  if (!cursor.done()) reject('TRAILING_REJECTED');
  attachSection(modules, sources, 'sourceOffset', 'sourceLength', 'source');
  attachSection(modules, sourceMaps, 'sourceMapOffset', 'sourceMapLength', 'sourceMap');
  const javascript = modules.filter(module => module.kind === 0);
  const actualNames = new Set(javascript.map(module => module.specifier));
  const matching = candidates.filter(layout => javascript.length === layout.expectedSources.size
    && actualNames.size === layout.expectedSources.size
    && [...layout.expectedSources.keys()].every(name => actualNames.has(name)));
  if (matching.length !== 1) reject('CLOSURE_REJECTED');
  const selected = matching[0];
  const originals = new Map();
  for (const module of javascript) {
    originals.set(module.specifier, parseSourceMap(module, selected.expectedSources.get(module.specifier)));
  }
  verifyEmittedImports(javascript, actualNames); verifyOpaqueMarkers(modules, selected);
  return originals;
}

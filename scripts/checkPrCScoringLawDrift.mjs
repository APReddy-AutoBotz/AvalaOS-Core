import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ACCEPTED_BASE = '5433cad41721355e3ec5a29bc2f87772540c77b5';
export const SCORING_PATHS = Object.freeze(['services/scoringEngine.ts', 'services/scoringEngine.test.ts', 'scripts/runScoringRegression.mjs']);
export const BASELINE_SHA256 = Object.freeze({
  'services/scoringEngine.ts': '5361966c91e6492ac69b3f79841365decc6de96472d345ed0472c24f9bd27f04',
  'services/scoringEngine.test.ts': '293810f36aa98367e479e36af2dba886af666b02e894022dd5b5523352f7e147',
  'scripts/runScoringRegression.mjs': '8c834d551b50d1e70b23f6af40c48703b6126ec0fb4e3d144809a989c836985b',
});
export const CURRENT_SCORER_CANONICAL_SHA256 = 'c06bd2ddab219755d13d45ee55793b2245da52e2e7ee1dc82cb0fb5d2d326c90';
export const TYPE_SYMBOLS = Object.freeze(['AssessmentResponses','AssessmentScoreResult','BusinessValueSummary','ConfidenceBand','DecisionPack','EngineOutput','GateDecision','GatingOutcome','GovernanceSummary','HandoffEligibility','HandoffPack','OperatingModelRecommendation','PriorityTier','RiskTier','TechnologyFitScores']);
const digest = value => createHash('sha256').update(value).digest('hex');
const decoder = new TextDecoder('utf-8', { fatal: true });
const ensure = (condition, code) => { if (!condition) throw new Error(code); };

export function validateDirectEnvironment(environment) {
  assert(environment && typeof environment === 'object' && !Array.isArray(environment), 'ENVIRONMENT_REQUIRED');
  assert(!Object.keys(environment).some(key => /^(?:NODE_OPTIONS|NODE_PATH)$/iu.test(key)), 'NODE_ENVIRONMENT_REJECTED');
  const git = Object.keys(environment).filter(key => /^GIT_/iu.test(key)).sort();
  if (git.length) {
    assert.deepEqual(git, ['GIT_CONFIG_COUNT','GIT_CONFIG_KEY_0','GIT_CONFIG_VALUE_0']);
    assert.equal(environment.GIT_CONFIG_COUNT, '1'); assert.equal(environment.GIT_CONFIG_KEY_0, 'core.fsmonitor'); assert.equal(environment.GIT_CONFIG_VALUE_0, 'false');
  }
  return true;
}

export function canonicalText(bytes, label = 'source') {
  assert(Buffer.isBuffer(bytes), `${label}:BUFFER_REQUIRED`); assert(bytes.length > 0 && bytes.length <= 2 * 1024 ** 2, `${label}:SIZE_REJECTED`);
  assert(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf), `${label}:BOM_REJECTED`);
  let text;
  try { text = decoder.decode(bytes); } catch { throw new Error(`${label}:INVALID_UTF8_REJECTED`); }
  assert(!text.includes('\0'), `${label}:NUL_REJECTED`);
  const crlf = (text.match(/\r\n/gu) ?? []).length, bareCr = (text.replace(/\r\n/gu, '').match(/\r/gu) ?? []).length, bareLf = (text.replace(/\r\n/gu, '').match(/\n/gu) ?? []).length;
  assert.equal(bareCr, 0, `${label}:BARE_CR_REJECTED`); assert(!(crlf && bareLf), `${label}:MIXED_EOL_REJECTED`); assert(crlf || bareLf, `${label}:NEWLINES_REQUIRED`);
  return { text: text.replace(/\r\n/gu, '\n'), style: crlf ? 'crlf' : 'lf' };
}

const AST_PROBE = `
const compiler = await import(process.argv[1]);
const ts = compiler.default || compiler;
let sourceText = '';
for await (const chunk of process.stdin) sourceText += chunk;
const source = ts.createSourceFile('scoringEngine.ts', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const imports = source.statements.filter(ts.isImportDeclaration);
const declaration = imports[0], clause = declaration?.importClause;
const named = clause?.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : [];
process.stdout.write(JSON.stringify({
  version: ts.version, parseDiagnostics: source.parseDiagnostics.length, importCount: imports.length,
  firstImport: source.statements[0] === declaration, module: declaration && ts.isStringLiteral(declaration.moduleSpecifier) ? declaration.moduleSpecifier.text : null,
  typeOnly: clause?.isTypeOnly ?? null, defaultImport: Boolean(clause?.name), namedImports: Boolean(clause?.namedBindings && ts.isNamedImports(clause.namedBindings)),
  attributes: Boolean(declaration?.assertClause || declaration?.attributes),
  symbols: named.map(element => element.name.text), aliases: named.map(element => Boolean(element.propertyName)), elementTypeOnly: named.map(element => element.isTypeOnly),
}));`;
const infrastructureEnvironment = environment => Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR']
  .filter(key => environment[key] !== undefined).map(key => [key, environment[key]]));
const compilerPath = () => realpathSync(createRequire(import.meta.url).resolve('typescript'));

export function validateCompilerAuthority(root, compiler = compilerPath()) {
  const expectedCompiler = realpathSync(path.join(root, 'node_modules/typescript/lib/typescript.js'));
  assert.equal(realpathSync(compiler), expectedCompiler, 'TYPESCRIPT_AUTHORITY_REJECTED');
  assert.equal(JSON.parse(readFileSync(path.join(root, 'node_modules/typescript/package.json'), 'utf8')).version, '5.8.3', 'TYPESCRIPT_PACKAGE_VERSION_REJECTED');
  return true;
}

export function inspectScoringImportAst(text, expectedModule, expectedTypeOnly, environment = process.env) {
  let parsed;
  try {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', AST_PROBE, pathToFileURL(compilerPath()).href], {
      encoding: 'utf8', env: infrastructureEnvironment(environment), input: text, windowsHide: true,
      timeout: 30_000, maxBuffer: 64 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
    });
    assert(output.length <= 8 * 1024, 'TYPESCRIPT_AST_OUTPUT_REJECTED');
    parsed = JSON.parse(output);
  } catch { throw new Error('TYPESCRIPT_AST_CHILD_REJECTED'); }
  assert.deepEqual(Object.keys(parsed).sort(), ['aliases','attributes','defaultImport','elementTypeOnly','firstImport','importCount','module','namedImports','parseDiagnostics','symbols','typeOnly','version']);
  assert.equal(parsed.version, '5.8.3', 'TYPESCRIPT_VERSION_REJECTED'); assert.equal(parsed.parseDiagnostics, 0, 'TYPESCRIPT_PARSE_REJECTED');
  assert.equal(parsed.importCount, 1, 'IMPORT_COUNT_REJECTED'); assert.equal(parsed.firstImport, true, 'FIRST_IMPORT_REJECTED');
  assert.equal(parsed.typeOnly, expectedTypeOnly, 'IMPORT_TYPE_AUTHORITY_REJECTED'); assert.equal(parsed.defaultImport, false, 'DEFAULT_IMPORT_REJECTED');
  assert.equal(parsed.namedImports, true, 'NAMESPACE_IMPORT_REJECTED'); assert.equal(parsed.module, expectedModule, 'MODULE_SPECIFIER_REJECTED');
  assert.equal(parsed.attributes, false, 'IMPORT_ATTRIBUTES_REJECTED'); assert.deepEqual(parsed.symbols, TYPE_SYMBOLS, 'IMPORT_SYMBOLS_REJECTED');
  assert(parsed.aliases.every(value => value === false), 'IMPORT_ALIAS_REJECTED'); assert(parsed.elementTypeOnly.every(value => value === false), 'PER_ELEMENT_TYPE_REJECTED');
  return true;
}

export function validateScoringTransformation({ baselineScorer, currentScorer, baselineTest, currentTest, baselineRegression, currentRegression }) {
  for (const [relative, bytes] of Object.entries({ 'services/scoringEngine.ts': baselineScorer, 'services/scoringEngine.test.ts': baselineTest, 'scripts/runScoringRegression.mjs': baselineRegression })) assert.equal(digest(bytes), BASELINE_SHA256[relative], `BASELINE_BLOB_REJECTED:${relative}`);
  const unchanged = (baselineBytes, currentBytes, label, code) => {
    const baselineValue = canonicalText(baselineBytes, `baseline-${label}`), currentValue = canonicalText(currentBytes, `current-${label}`);
    ensure(currentValue.text === baselineValue.text, code);
    const reconstructed = currentValue.style === 'crlf' ? currentValue.text.replace(/\n/gu, '\r\n') : currentValue.text;
    assert(Buffer.from(reconstructed).equals(currentBytes), `RAW_RECONSTRUCTION_REJECTED:${label}`);
  };
  unchanged(baselineTest, currentTest, 'scoring-test', 'SCORING_TEST_DRIFT_REJECTED');
  unchanged(baselineRegression, currentRegression, 'scoring-regression', 'SCORING_REGRESSION_DRIFT_REJECTED');
  const baseline = canonicalText(baselineScorer, 'baseline-scorer'), current = canonicalText(currentScorer, 'current-scorer');
  const first = "import {\n", last = "} from '../types';\n"; assert.equal(baseline.text.split(first).length - 1, 1, 'BASELINE_IMPORT_START_REJECTED'); assert.equal(baseline.text.split(last).length - 1, 1, 'BASELINE_IMPORT_END_REJECTED');
  const expected = baseline.text.replace(first, 'import type {\n').replace(last, "} from '../types.ts';\n"); ensure(current.text === expected, 'SCORING_BODY_DRIFT_REJECTED'); assert.equal(digest(Buffer.from(current.text)), CURRENT_SCORER_CANONICAL_SHA256, 'CURRENT_CANONICAL_REJECTED');
  inspectScoringImportAst(baseline.text, '../types', false); inspectScoringImportAst(current.text, '../types.ts', true);
  const reconstructed = current.style === 'crlf' ? current.text.replace(/\n/gu, '\r\n') : current.text; assert(Buffer.from(reconstructed).equals(currentScorer), 'RAW_RECONSTRUCTION_REJECTED');
  return Object.freeze({ baselineScorerSha256: digest(baselineScorer), currentCanonicalSha256: digest(Buffer.from(current.text)), lineEndings: current.style });
}

const identity = file => { const value = statSync(file, { bigint: true }); return { dev: value.dev, ino: value.ino, size: value.size, mtimeNs: value.mtimeNs }; };
const readRegularFile = (root, relative, allowed) => {
  assert(allowed.includes(relative), 'SOURCE_PATH_NOT_PINNED');
  const file = path.join(root, relative);
  assert.equal(path.relative(root, file).replaceAll('\\', '/'), relative, 'SOURCE_PATH_ESCAPE_REJECTED');
  const status = lstatSync(file);
  assert(status.isFile() && !status.isSymbolicLink() && realpathSync(file) === file, `SOURCE_PATH_REJECTED:${relative}`);
  return Object.freeze({ file, identity: identity(file), bytes: readFileSync(file) });
};
export const readPinnedRegularFile = (root, relative) => readRegularFile(root, relative, SCORING_PATHS);
export function validateStableRead(beforeIdentity, afterIdentity, beforeBytes, afterBytes, label = 'source') {
  assert.deepEqual(afterIdentity, beforeIdentity, `SOURCE_IDENTITY_RACE:${label}`);
  assert.equal(digest(afterBytes), digest(beforeBytes), `SOURCE_BYTES_RACE:${label}`);
  return true;
}
const cleanGitEnvironment = environment => ({
  ...infrastructureEnvironment(environment),
  GIT_ASKPASS: '', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0',
});
const gitArguments = (root, args) => ['--no-replace-objects','-c','core.fsmonitor=false','-c',`safe.directory=${root}`,...args];
const gitBuffer = (root, environment, args) => {
  try { return execFileSync('git', gitArguments(root, args), { cwd: root, env: cleanGitEnvironment(environment), encoding: 'buffer', windowsHide: true, timeout: 30_000, maxBuffer: 4 * 1024 ** 2, stdio: ['ignore','pipe','pipe'] }); }
  catch { throw new Error('GIT_COMMAND_REJECTED'); }
};
const gitVoid = (root, environment, args) => {
  try { execFileSync('git', gitArguments(root, args), { cwd: root, env: cleanGitEnvironment(environment), windowsHide: true, timeout: 30_000, stdio: 'ignore' }); }
  catch { throw new Error('GIT_COMMAND_REJECTED'); }
};
const gitText = (root, environment, args) => gitBuffer(root, environment, args).toString('utf8').trim();

export function checkScoringLawDrift(root = process.cwd(), environment = process.env, arguments_ = []) {
  validateDirectEnvironment(environment); assert.deepEqual(arguments_, [], 'ARGUMENTS_REJECTED');
  const resolved = realpathSync(root); assert.equal(resolved, path.resolve(root), 'REPOSITORY_REALPATH_REJECTED'); assert.equal(gitText(resolved, environment, ['rev-parse','--show-toplevel']).replaceAll('\\','/'), resolved.replaceAll('\\','/'), 'REPOSITORY_ROOT_REJECTED');
  gitText(resolved, environment, ['cat-file','-e',`${ACCEPTED_BASE}^{commit}`]); gitVoid(resolved, environment, ['merge-base','--is-ancestor',ACCEPTED_BASE,'HEAD']);
  const current = {}, baseline = {}, before = {};
  for (const relative of SCORING_PATHS) { const pinned = readPinnedRegularFile(resolved, relative); before[relative] = pinned.identity; current[relative] = pinned.bytes; baseline[relative] = gitBuffer(resolved, environment, ['show',`${ACCEPTED_BASE}:${relative}`]); }
  const result = validateScoringTransformation({ baselineScorer: baseline[SCORING_PATHS[0]], currentScorer: current[SCORING_PATHS[0]], baselineTest: baseline[SCORING_PATHS[1]], currentTest: current[SCORING_PATHS[1]], baselineRegression: baseline[SCORING_PATHS[2]], currentRegression: current[SCORING_PATHS[2]] });
  const scorerPath = path.join(resolved, SCORING_PATHS[0]);
  const typesPath = path.join(resolved, 'types.ts');
  const typesBefore = readRegularFile(resolved, 'types.ts', ['types.ts']);
  assert.equal(realpathSync(path.resolve(path.dirname(scorerPath), '../types.ts')), typesPath, 'CURRENT_TYPE_AUTHORITY_REJECTED');
  assert.equal(realpathSync(`${path.resolve(path.dirname(scorerPath), '../types')}.ts`), typesPath, 'BASELINE_TYPE_AUTHORITY_REJECTED');
  validateCompilerAuthority(resolved);
  for (const relative of SCORING_PATHS) { const pinned = readPinnedRegularFile(resolved, relative); validateStableRead(before[relative], pinned.identity, current[relative], pinned.bytes, relative); }
  const typesAfter = readRegularFile(resolved, 'types.ts', ['types.ts']);
  validateStableRead(typesBefore.identity, typesAfter.identity, typesBefore.bytes, typesAfter.bytes, 'types.ts');
  return result;
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) { try { const result = checkScoringLawDrift(process.cwd(), process.env, process.argv.slice(2)); process.stdout.write(`PR_C_SCORING_LAW_DRIFT ${JSON.stringify({status:'passed',acceptedBase:ACCEPTED_BASE,paths:SCORING_PATHS,currentCanonicalSha256:result.currentCanonicalSha256})}\n`); } catch { process.stderr.write('PR_C_SCORING_LAW_DRIFT_REJECTED\n'); process.exitCode = 1; } }

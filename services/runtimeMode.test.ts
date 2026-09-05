import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PR_C_CONTROLLED_HUMAN_CONTRACT_VERSION,
  PR_C_CONTROLLED_HUMAN_MIGRATION_TIP,
  PR_C_CONTROLLED_HUMAN_PREVIEW_ORIGIN,
  RUNTIME_BOUNDARY_USER_MESSAGE,
  RUNTIME_MODES,
  RuntimeBoundaryError,
  isValidServerConfiguration,
  resolveControlledHumanBrowserBinding,
  resolveRuntimeAuthority,
  resolveRuntimeDataAccess,
  resolveRuntimeMode,
  validateControlledHumanBackendAttestation,
} from './runtimeMode';

console.log('Starting runtime mode boundary regression suite...');

const safePublishableKey='sb_publishable_synthetic_public_key_264';
const safeLegacyAnonJwt='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.signature';
const safeSupabaseUrl=`https://${'abcdefghijklmnopqrst'}.supabase.co`;
assert.equal(isValidServerConfiguration(safeSupabaseUrl,safePublishableKey),true);
assert.equal(isValidServerConfiguration(safeSupabaseUrl,safeLegacyAnonJwt),true);
assert.equal(isValidServerConfiguration('https://127.0.0.1:59999',safePublishableKey),false);
for(const [url,key] of [[undefined,'key'],[safeSupabaseUrl,undefined],['junk','key'],['ftp://tenant.invalid','key'],[` ${safeSupabaseUrl}`,'key'],[safeSupabaseUrl,' '],[safeSupabaseUrl,'sb_secret_privileged_key_264'],[safeSupabaseUrl,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature'],[safeSupabaseUrl,'malformed.jwt.value']])assert.equal(isValidServerConfiguration(url,key),false);

const controlledSha = 'a'.repeat(40);
const controlledDeployId = 'b'.repeat(24);
const controlledExerciseDigest = `sha256:${'c'.repeat(64)}`;
const controlledTargetFingerprint = `sha256:${'d'.repeat(64)}`;
const controlledPublicTargetDigest = `sha256:${'1'.repeat(64)}`;
const controlledInput = {
  enabled: 'authorized',
  runtimeMode: 'pilot',
  serverConfigured: true,
  releaseSha: controlledSha,
  reviewHeadSha: controlledSha,
  deployId: controlledDeployId,
  deployOrigin: PR_C_CONTROLLED_HUMAN_PREVIEW_ORIGIN,
  exerciseDigest: controlledExerciseDigest,
  targetFingerprint: controlledTargetFingerprint,
  publicTargetDigest: controlledPublicTargetDigest,
  locationOrigin: PR_C_CONTROLLED_HUMAN_PREVIEW_ORIGIN,
  pathname: '/sign-in',
};
const controlledResolution = resolveControlledHumanBrowserBinding(controlledInput);
assert.equal(controlledResolution.status, 'ready');
if (controlledResolution.status !== 'ready') throw new Error('controlled browser binding unexpectedly blocked');

const controlledAttestation = {
  attested: true,
  contractVersion: PR_C_CONTROLLED_HUMAN_CONTRACT_VERSION,
  environmentClass: 'hosted_nonproduction_pilot',
  prNumber: 264,
  releaseSha: controlledSha,
  reviewHeadSha: controlledSha,
  deployId: controlledDeployId,
  deployOrigin: PR_C_CONTROLLED_HUMAN_PREVIEW_ORIGIN,
  exerciseDigest: controlledExerciseDigest,
  targetFingerprint: controlledTargetFingerprint,
  publicTargetDigest: controlledPublicTargetDigest,
  personaManifestDigest: `sha256:${'e'.repeat(64)}`,
  fixtureManifestDigest: `sha256:${'f'.repeat(64)}`,
  migrationTip: PR_C_CONTROLLED_HUMAN_MIGRATION_TIP,
  productionAuthorized: false,
  customerDataAuthorized: false,
  realProviderCallsAuthorized: false,
} as const;
assert.deepEqual(
  validateControlledHumanBackendAttestation(controlledAttestation, controlledResolution.binding),
  controlledAttestation,
);

assert.equal(resolveControlledHumanBrowserBinding({
  ...controlledInput,
  enabled: undefined,
}).status, 'disabled');

for (const override of [
  { enabled: 'authorized ' },
  { enabled: 'true' },
  { runtimeMode: 'production' },
  { serverConfigured: false },
  { releaseSha: 'A'.repeat(40), reviewHeadSha: 'A'.repeat(40) },
  { reviewHeadSha: '9'.repeat(40) },
  { deployId: `${controlledDeployId} ` },
  { deployOrigin: 'https://deploy-preview-265--avalaos-pilot.netlify.app' },
  { deployOrigin: 'https://avalaos-pilot.netlify.app' },
  { locationOrigin: 'https://avalaos.com' },
  { locationOrigin: 'https://test.avalaos.com' },
  { pathname: '/sandbox' },
  { pathname: '/sandbox/sign-in' },
  { pathname: '/' },
  { exerciseDigest: `sha256:${'c'.repeat(63)}` },
  { targetFingerprint: `sha256:${'D'.repeat(64)}` },
  { publicTargetDigest: `sha256:${'D'.repeat(64)}` },
]) {
  const result = resolveControlledHumanBrowserBinding({ ...controlledInput, ...override });
  assert.equal(result.status, 'blocked');
  if (result.status === 'blocked') {
    assert.equal(result.error.code, 'RUNTIME_CONTROLLED_HUMAN_BINDING_REQUIRED');
    assert.equal(result.error.message, RUNTIME_BOUNDARY_USER_MESSAGE);
  }
}

for (const mutation of [
  { releaseSha: '9'.repeat(40) },
  { reviewHeadSha: '9'.repeat(40) },
  { deployId: '9'.repeat(24) },
  { deployOrigin: 'https://avalaos-pilot.netlify.app' },
  { exerciseDigest: `sha256:${'9'.repeat(64)}` },
  { targetFingerprint: `sha256:${'9'.repeat(64)}` },
  { publicTargetDigest: `sha256:${'9'.repeat(64)}` },
  { environmentClass: 'production' },
  { prNumber: 265 },
  { productionAuthorized: true },
  { customerDataAuthorized: true },
  { realProviderCallsAuthorized: true },
  { personaManifestDigest: 'not-a-digest' },
  { fixtureManifestDigest: 'not-a-digest' },
  { migrationTip: '20260904120001' },
  { migrationTip: '../../secret' },
  { unexpected: 'field' },
]) {
  assert.throws(
    () => validateControlledHumanBackendAttestation({ ...controlledAttestation, ...mutation }, controlledResolution.binding),
    (error: unknown) => error instanceof RuntimeBoundaryError
      && error.code === 'RUNTIME_CONTROLLED_HUMAN_ATTESTATION_REQUIRED'
      && error.message === RUNTIME_BOUNDARY_USER_MESSAGE,
  );
}
const missingAttestationField = { ...controlledAttestation } as Record<string, unknown>;
delete missingAttestationField.migrationTip;
assert.throws(
  () => validateControlledHumanBackendAttestation(missingAttestationField, controlledResolution.binding),
  (error: unknown) => error instanceof RuntimeBoundaryError
    && error.code === 'RUNTIME_CONTROLLED_HUMAN_ATTESTATION_REQUIRED',
);

for (const mode of RUNTIME_MODES) {
  const resolution = resolveRuntimeMode({
    configuredMode: mode,
    isAutomatedTestContext: mode === 'automated_test',
  });
  assert.equal(resolution.status, 'resolved');
  if (resolution.status === 'resolved') {
    assert.equal(resolution.mode, mode);
    assert.equal(resolution.source, 'explicit');
    assert.equal(
      resolution.allowLocalAuthority,
      mode === 'local_demo' || mode === 'automated_test',
    );
    assert.equal(
      resolution.requiresServerAuthority,
      mode === 'pilot' || mode === 'production',
    );
  }
}

for (const configuredMode of [undefined, null, '', '  ']) {
  const resolution = resolveRuntimeMode({
    configuredMode,
    isAutomatedTestContext: false,
  });
  assert.equal(resolution.status, 'blocked');
  if (resolution.status === 'blocked') {
    assert.equal(resolution.code, 'RUNTIME_MODE_REQUIRED');
    assert.equal(resolution.error.message, RUNTIME_BOUNDARY_USER_MESSAGE);
  }
}

for (const configuredMode of ['development', 'local-demo', 'internal-dev', 'staging']) {
  const resolution = resolveRuntimeMode({
    configuredMode,
    isAutomatedTestContext: false,
  });
  assert.equal(resolution.status, 'blocked');
  if (resolution.status === 'blocked') {
    assert.equal(resolution.code, 'RUNTIME_MODE_INVALID');
    assert.equal(resolution.allowLocalAuthority, false);
  }
}

const uncontrolledTestMode = resolveRuntimeMode({
  configuredMode: 'automated_test',
  isAutomatedTestContext: false,
});
assert.equal(uncontrolledTestMode.status, 'blocked');
if (uncontrolledTestMode.status === 'blocked') {
  assert.equal(
    uncontrolledTestMode.code,
    'RUNTIME_AUTOMATED_TEST_CONTEXT_REQUIRED',
  );
}

for (const mode of RUNTIME_MODES) {
  for (const serverConfigured of [false, true]) {
    const resolution = resolveRuntimeMode({
      configuredMode: mode,
      isAutomatedTestContext: mode === 'automated_test',
    });
    const shouldResolve = serverConfigured || mode === 'local_demo' || mode === 'automated_test';
    if (!shouldResolve) {
      assert.throws(
        () => resolveRuntimeAuthority({ modeResolution: resolution, serverConfigured }),
        (error: unknown) => error instanceof RuntimeBoundaryError && error.code === 'RUNTIME_SERVER_CONFIGURATION_REQUIRED',
      );
      continue;
    }
    const authority = resolveRuntimeAuthority({ modeResolution: resolution, serverConfigured });
    assert.equal(authority.mode, mode);
    assert.equal(authority.dataAccess, serverConfigured ? 'server' : 'local');
    assert.equal(authority.allowLocalAuthority, !serverConfigured);
    assert.equal(authority.requiresServerAuthority, serverConfigured);
  }
}
const localDemo = resolveRuntimeMode({
  configuredMode: 'local_demo',
  isAutomatedTestContext: false,
});
assert.equal(
  resolveRuntimeDataAccess({ modeResolution: localDemo, serverConfigured: false }),
  'local',
);
assert.equal(
  resolveRuntimeDataAccess({ modeResolution: localDemo, serverConfigured: true }),
  'server',
);

const controlledTest = resolveRuntimeMode({
  configuredMode: 'automated_test',
  isAutomatedTestContext: true,
});
assert.equal(
  resolveRuntimeDataAccess({ modeResolution: controlledTest, serverConfigured: false }),
  'local',
);

for (const mode of ['pilot', 'production'] as const) {
  const resolution = resolveRuntimeMode({
    configuredMode: mode,
    isAutomatedTestContext: false,
  });
  assert.equal(
    resolveRuntimeDataAccess({ modeResolution: resolution, serverConfigured: true }),
    'server',
  );
  assert.throws(
    () =>
      resolveRuntimeDataAccess({
        modeResolution: resolution,
        serverConfigured: false,
      }),
    (error: unknown) =>
      error instanceof RuntimeBoundaryError &&
      error.code === 'RUNTIME_SERVER_CONFIGURATION_REQUIRED' &&
      error.message === RUNTIME_BOUNDARY_USER_MESSAGE,
  );
}

const missingMode = resolveRuntimeMode({
  configuredMode: undefined,
  isAutomatedTestContext: false,
});
assert.throws(
  () =>
    resolveRuntimeDataAccess({
      modeResolution: missingMode,
      serverConfigured: true,
    }),
  (error: unknown) =>
    error instanceof RuntimeBoundaryError && error.code === 'RUNTIME_MODE_REQUIRED',
);

const adapterPaths = [
  'services/adapters/authAdapter.ts',
  'services/adapters/orgAdapter.ts',
  'services/adapters/assessAdapter.ts',
  'services/adapters/docsAdapter.ts',
  'services/adapters/deliveryAdapter.ts',
  'services/adapters/timesheetAdapter.ts',
  'services/adapters/handoffLedgerAdapter.ts',
];

for (const adapterPath of adapterPaths) {
  const source = readFileSync(adapterPath, 'utf8');
  assert.match(source, /getRuntimeDataAccess/);
  assert.doesNotMatch(source, /!isSupabaseConfigured\(\)/);
}

const authAdapterSource = readFileSync('services/adapters/authAdapter.ts', 'utf8');
assert.doesNotMatch(authAdapterSource, /demoPersona/);
const serverMapperSource = authAdapterSource.slice(
  authAdapterSource.indexOf('const mapSupabaseUserToAppUser'),
  authAdapterSource.indexOf('export const authAdapter'),
);
assert.doesNotMatch(serverMapperSource, /MOCK_USERS|MOCK_LOGIN_PROFILES|demoPersona/);
const serverSignInSource = authAdapterSource.slice(
  authAdapterSource.indexOf('async signIn'),
  authAdapterSource.indexOf('async signOut'),
);
assert.ok(
  serverSignInSource.indexOf('await requireControlledHumanBackendAttestation()')
    < serverSignInSource.indexOf('supabase.auth.signInWithPassword'),
  'controlled-human backend attestation must finish before credentials are sent',
);
const currentUserSource = authAdapterSource.slice(authAdapterSource.indexOf('async getCurrentUser'));
assert.ok(
  currentUserSource.indexOf('await requireControlledHumanBackendAttestation()')
    < currentUserSource.indexOf('supabase.auth.getUser'),
  'controlled-human backend attestation must finish before restoring a server session',
);

const supabaseClientSource = readFileSync('services/supabaseClient.ts', 'utf8');
assert.doesNotMatch(supabaseClientSource, /service[_-]?role|secret[_-]?key/i);
assert.match(supabaseClientSource, /typeof __AVALA_SYNTHETIC_BROWSER_TEST_BUILD__ !== 'undefined'[\s\S]*__AVALA_SYNTHETIC_BROWSER_TEST_BUILD__ === true[\s\S]*supabaseUrl === 'https:\/\/127[.]0[.]0[.]1:59999'[\s\S]*isSafePublicSupabaseCredential\(supabaseAnonKey\)/u);
assert.doesNotMatch(supabaseClientSource, /VITE_[A-Z0-9_]*BROWSER_TEST/u, 'the loopback adapter must not be activatable by a public runtime variable');
const viteConfigurationSource = readFileSync('vite.config.ts', 'utf8');
assert.match(viteConfigurationSource, /'__AVALA_SYNTHETIC_BROWSER_TEST_BUILD__': JSON[.]stringify\(syntheticBrowserTestBuild\)/u);
assert.doesNotMatch(viteConfigurationSource, /VITE_[A-Z0-9_]*BROWSER_TEST/u, 'the compile-time loopback adapter must remain runner-only');
assert.match(viteConfigurationSource, /syntheticBrowserTestBuild = false/u);
assert.doesNotMatch(viteConfigurationSource, /\.some\(name => process[.]env\[name\] === 'true'\)/u, 'ambient environment names cannot compile the loopback adapter');
const syntheticBrowserViteConfigurationSource = readFileSync('vite.synthetic-browser-test.config.ts', 'utf8');
assert.match(syntheticBrowserViteConfigurationSource, /createAvalaViteConfig\(\{ syntheticBrowserTestBuild: true \}\)/u);
const browserRunnerSource = readFileSync('scripts/runTranscriptFlowBrowser.mjs', 'utf8');
assert.match(browserRunnerSource, /SYNTHETIC_BROWSER_VITE_CONFIG = 'vite[.]synthetic-browser-test[.]config[.]ts'/u);
const runtimeAuthoritySource = supabaseClientSource.slice(
  supabaseClientSource.indexOf('export const getRuntimeAuthority'),
  supabaseClientSource.indexOf('export const getRuntimeDataAccess'),
);
assert.ok(
  runtimeAuthoritySource.indexOf('getControlledHumanBrowserBinding()')
    < runtimeAuthoritySource.indexOf('isHostedSandboxRequest()'),
  'controlled-human binding must reject /sandbox before local sandbox authority is considered',
);

const accessViewSource = readFileSync('components/auth/EnterpriseAccessView.tsx', 'utf8');
const submitLoginSource = accessViewSource.slice(
  accessViewSource.indexOf('const submitLogin'),
  accessViewSource.indexOf('const selectPersona'),
);
assert.doesNotMatch(
  submitLoginSource,
  /pushState|replaceState|location\.(?:assign|replace)/,
  'successful controlled-human sign-in must preserve the attested /sign-in pathname',
);

const appSource = readFileSync('App.tsx', 'utf8');
assert.ok(
  appSource.indexOf("controlledHumanBrowserBinding.status === 'blocked'")
    < appSource.indexOf("!localRuntimeEnabled && !['ready', 'read_only'].includes(sessionState)"),
  'a post-entry path or binding substitution must block before workspace projections render',
);

console.log('Runtime mode boundary regression suite passed.');

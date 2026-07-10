import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  RUNTIME_BOUNDARY_USER_MESSAGE,
  RUNTIME_MODES,
  RuntimeBoundaryError,
  resolveRuntimeDataAccess,
  resolveRuntimeMode,
} from './runtimeMode';

console.log('Starting runtime mode boundary regression suite...');

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

console.log('Runtime mode boundary regression suite passed.');

import assert from 'node:assert/strict';
import test from 'node:test';

import { authenticatedHostedFixtureIdentity } from './authenticatedHostedFixtureIdentity.mjs';

const input = Object.freeze({
  runId: '12345',
  attempt: '1',
  exerciseId: '82000000-0000-4000-8000-000000000041',
  projectName: 'desktop-chromium-postgres',
});

test('fixture identity binds process and delivery names to the exact run, attempt, exercise and browser project', () => {
  assert.deepEqual(authenticatedHostedFixtureIdentity(input), {
    binding: 'e1bc3b7134bf',
    suffix: '[run 12345.1 e1bc3b7134bf]',
    processName: 'desktop-chromium-postgres connected lifecycle [run 12345.1 e1bc3b7134bf]',
    deliveryProjectName: 'desktop-chromium-postgres delivery project [run 12345.1 e1bc3b7134bf]',
  });
  assert.deepEqual(authenticatedHostedFixtureIdentity(input), authenticatedHostedFixtureIdentity(input));
});

test('fixture identity changes for every trusted binding input and rejects unbounded or malformed inputs', () => {
  for (const [field, value] of [
    ['runId', '12346'],
    ['attempt', '2'],
    ['exerciseId', '82000000-0000-4000-8000-000000000042'],
    ['projectName', 'pixel-7-chromium-postgres'],
  ]) assert.notEqual(authenticatedHostedFixtureIdentity({ ...input, [field]: value }).binding,
    authenticatedHostedFixtureIdentity(input).binding);

  for (const candidate of [
    { ...input, runId: '0' },
    { ...input, runId: '1'.repeat(21) },
    { ...input, attempt: '01' },
    { ...input, attempt: 0 },
    { ...input, exerciseId: 'not-a-uuid' },
    { ...input, projectName: 'Desktop Chromium' },
  ]) assert.throws(() => authenticatedHostedFixtureIdentity(candidate),
    /AUTHENTICATED_HOSTED_FIXTURE_IDENTITY_REJECTED/u);
});

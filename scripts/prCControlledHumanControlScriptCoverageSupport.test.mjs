import assert from 'node:assert/strict';
import test from 'node:test';

import { main as captureCheckpoint } from './capturePrCControlledHumanCheckpoint.mjs';
import { main as verifySession } from './verifyPrCControlledHumanSession.mjs';

test('checkpoint and session production wrappers reject missing and malformed argument contracts', async () => {
  await assert.rejects(captureCheckpoint([], {}), /PR_C_CH_CHECKPOINT_ARGUMENTS/u);
  await assert.rejects(captureCheckpoint(['--preparation'], {}), /PR_C_CH_ARGUMENTS/u);
  await assert.rejects(verifySession([], {}), /PR_C_CH_SESSION_ARGUMENTS/u);
  await assert.rejects(verifySession(['--preparation'], {}), /PR_C_CH_ARGUMENTS/u);
});

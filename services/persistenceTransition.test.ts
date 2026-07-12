import assert from 'node:assert/strict';
import { persistBeforeCommit } from './persistenceTransition';

const main = async () => {
  let committed = false;
  await assert.rejects(
    persistBeforeCommit(
      async () => { throw new Error('persistence denied'); },
      () => { committed = true; },
    ),
    /persistence denied/,
  );
  assert.equal(committed, false);

  const saved = await persistBeforeCommit(async () => ({ id: 'saved-1' }), value => {
    assert.equal(value.id, 'saved-1');
    committed = true;
  });
  assert.equal(saved.id, 'saved-1');
  assert.equal(committed, true);
  console.log('Persistence-before-success transition regression suite passed.');
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

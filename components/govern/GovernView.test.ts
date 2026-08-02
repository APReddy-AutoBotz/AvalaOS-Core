import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('components/govern/GovernView.tsx', 'utf8');
assert.ok(source.includes('Avala Govern · read-only overview'));
assert.ok(source.includes('Govern is a visibility layer'));
assert.ok(source.includes('data-capture-state'));
for (const mutationLabel of ['Approve review', 'Reject review', 'Final approve', 'Commit revision']) {
  assert.equal(source.includes(mutationLabel), false, `Govern must not expose ${mutationLabel}`);
}

console.log('govern view: 7 read-only composition and no-mutation assertions passed');

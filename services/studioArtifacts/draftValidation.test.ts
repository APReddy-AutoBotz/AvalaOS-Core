import assert from 'node:assert/strict';
import { validateStudioDraftContent } from './draftValidation';

assert.equal(validateStudioDraftContent('').valid, false);
assert.equal(validateStudioDraftContent('{invalid').valid, false);
assert.equal(validateStudioDraftContent('[]').valid, false);
assert.equal(validateStudioDraftContent('null').valid, false);
const corrected = validateStudioDraftContent('{"title":"Corrected governed draft"}');
assert.equal(corrected.valid, true);
assert.deepEqual(corrected.valid ? corrected.content : null, { title: 'Corrected governed draft' });

console.log('studio draft validation: 6 invalid-input and immediate-correction assertions passed');

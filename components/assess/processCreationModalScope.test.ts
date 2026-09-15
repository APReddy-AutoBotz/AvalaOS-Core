import assert from 'node:assert/strict';
import { processCreationModalCompletionCurrent, processCreationModalVisible } from './processCreationModalScope';

const scope='actor:organization:workspace:v7';
const newScope='actor:organization:other-workspace:v7';
const newEpoch='actor:organization:workspace:v8';
assert.equal(processCreationModalVisible(true,scope,scope),true);
assert.equal(processCreationModalVisible(false,scope,scope),false);
assert.equal(processCreationModalVisible(true,scope,newScope),false);
assert.equal(processCreationModalVisible(true,scope,newEpoch),false);
assert.equal(processCreationModalVisible(true,scope,null),false);
assert.equal(processCreationModalCompletionCurrent(scope,scope,true),true);
assert.equal(processCreationModalCompletionCurrent(scope,newScope,true),false);
assert.equal(processCreationModalCompletionCurrent(scope,newEpoch,true),false);
assert.equal(processCreationModalCompletionCurrent(scope,scope,false),false);
console.log('process creation modal scope: same-authority form and stale completion cases passed');

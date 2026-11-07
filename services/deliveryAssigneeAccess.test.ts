import { strict as assert } from 'assert';
import fs from 'node:fs';
import { canUseDeliveryAssigneeDirectory } from './deliveryAssigneeAccess';

const access = (capabilities: string[], sessionState = 'ready', dataAccess = 'server') =>
  canUseDeliveryAssigneeDirectory({ capabilities, sessionState, dataAccess });

assert.equal(access(['project.manage']), true, 'the intended Delivery project manager can view eligible assignees and assign work');
assert.equal(access(['task.assign']), true, 'an explicit task assignment grant remains supported');
assert.equal(access(['task.read', 'task.update.own']), false, 'read/update access does not reveal the assignment directory');
assert.equal(access(['project.manage'], 'read_only'), false, 'read-only sessions cannot change assignment');
assert.equal(access(['project.manage'], 'ready', 'local'), false, 'server assignment authority is not inferred in local mode');

const taskDetailSource = fs.readFileSync('components/delivery/TaskDetailModal.tsx', 'utf8');
const deliveryPackSource = fs.readFileSync('components/delivery/DeliveryPackView.tsx', 'utf8');
assert.match(taskDetailSource, />Assignees</);
assert.match(taskDetailSource, /assignment changes require assignment permission/);
assert.match(deliveryPackSource, /<div>Assignees<\/div>/);
assert.doesNotMatch(deliveryPackSource, /<div>Owners<\/div>/);

console.log('Delivery assignee directory access remains bound to ready server assignment authority');

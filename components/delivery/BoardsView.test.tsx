import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Project, Task, User } from '../../types';
import BoardsView, { type DeliveryBoardMutationPolicy } from './BoardsView';

const project: Project = {
  id: 'project-1', name: 'Evidence delivery', description: '', ownerId: 'owner-1', teamId: 'team-1',
  status: 'Active', healthStatus: 'On Track', lifecycleStage: 'Execution', priority: 'High',
  startDate: '2026-11-01', endDate: '2026-12-01', createdAt: '2026-11-01T00:00:00.000Z',
} as unknown as Project;
const currentUser: User = { id: 'delivery-planner', name: 'Delivery Planner', email: 'planner@example.test', permissions: [] };
const discovery: Task = {
  id: 'discovery', title: 'Resolve PATCH evidence', description: 'Resolve the accepted question.',
  status: 'Done', priority: 'Medium', type: 'Task', projectId: project.id, assigneeIds: [],
  startDate: '', dueDate: '', dependencyIds: [], sourceLineage: { proposalRole: 'discovery' },
};
const dependent: Task = {
  ...discovery, id: 'dependent', title: 'Implement bounded PATCH handling', status: 'To Do',
  dependencyIds: [discovery.id], sourceLineage: { proposalRole: 'implementation' },
};
const allow: DeliveryBoardMutationPolicy = { canChangeStatus: true, canCreate: true, canDelete: true };
const deny: DeliveryBoardMutationPolicy = { canChangeStatus: false, canCreate: false, canDelete: false };
const render = (mutationPolicy: DeliveryBoardMutationPolicy, disposition: 'blocking_unresolved' | 'source_backed_answer_accepted') => renderToStaticMarkup(<BoardsView
  tasks={[discovery, dependent]} projects={[project]} epics={[]} users={[currentUser]} currentUser={currentUser}
  mutationPolicy={mutationPolicy} discoveryDispositions={new Map([[discovery.id, disposition]])} discoveryReadState="ready"
  onUpdateTaskStatus={() => undefined} onSelectTask={() => undefined} onAddTask={() => undefined} onDeleteTask={() => undefined}
/>);

const accepted = render(allow, 'source_backed_answer_accepted');
assert.match(accepted, /data-task-id="dependent"[\s\S]*?draggable="true"/,
  'server-authorized status mutation must make the released dependent card draggable');
assert.match(accepted, /data-task-id="discovery"[^>]*data-discovery-disposition="source_backed_answer_accepted"/);
assert.match(accepted, /Source-backed answer accepted/);

const unresolved = render(allow, 'blocking_unresolved');
assert.match(unresolved, /data-task-id="dependent"[\s\S]*?draggable="false"/,
  'Done alone must not release a discovery dependency with an unresolved committed disposition');

const denied = render(deny, 'source_backed_answer_accepted');
assert.match(denied, /data-task-id="dependent"[\s\S]*?draggable="false"/,
  'a committed accepted disposition must not create status authority when the server-bound capability decision denies it');
assert.doesNotMatch(denied, />Add task<\/button>/);

console.log('Delivery board: server-bound status authority, committed discovery release, unresolved denial and capability denial passed.');

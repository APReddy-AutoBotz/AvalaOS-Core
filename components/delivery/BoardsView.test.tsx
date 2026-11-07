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
assert.match(accepted, /aria-label="Move Implement bounded PATCH handling to another status"/,
  'the normal board exposes a keyboard and touch status control');
assert.doesNotMatch(accepted, /aria-label="Move Implement bounded PATCH handling to another status"[^>]*disabled=""/,
  'server-authorized released work has an enabled status control');

const unresolvedDiscovery = { ...discovery, status: 'Ready for Release' as const };
const unresolvedDependent = { ...dependent, dependencyIds: [unresolvedDiscovery.id] };
const unresolved = renderToStaticMarkup(<BoardsView
  tasks={[unresolvedDiscovery, unresolvedDependent]} projects={[project]} epics={[]} users={[currentUser]} currentUser={currentUser}
  mutationPolicy={allow} discoveryDispositions={new Map([[unresolvedDiscovery.id, 'blocking_unresolved']])} discoveryReadState="ready"
  onUpdateTaskStatus={() => { throw new Error('disabled transitions must not invoke writes'); }} onSelectTask={() => undefined} onAddTask={() => undefined} onDeleteTask={() => undefined}
/>);
assert.match(unresolved, /data-task-id="dependent"[\s\S]*?draggable="false"/,
  'an unresolved discovery prerequisite must keep dependent work locked');
assert.match(unresolved, /aria-label="Move Resolve PATCH evidence to another status"[\s\S]*?<option value="Done" disabled="">Done<\/option>/,
  'unresolved discovery keeps Done visibly unavailable');
assert.match(unresolved, /aria-label="Move Implement bounded PATCH handling to another status"[^>]*disabled=""/,
  'dependent implementation has no enabled forward status while discovery remains unresolved');

const denied = render(deny, 'source_backed_answer_accepted');
assert.match(denied, /data-task-id="dependent"[\s\S]*?draggable="false"/,
  'a committed accepted disposition must not create status authority when the server-bound capability decision denies it');
assert.match(denied, /aria-label="Move Implement bounded PATCH handling to another status"[^>]*disabled=""/,
  'capability-denied work keeps the accessible status control disabled');
assert.doesNotMatch(denied, />Add task<\/button>/);

console.log('Delivery board: server-bound status authority, committed discovery release, unresolved denial and capability denial passed.');

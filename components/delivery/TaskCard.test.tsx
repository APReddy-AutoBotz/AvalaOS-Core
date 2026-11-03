import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Task } from '../../types';
import TaskCard from './TaskCard';

const task = (dueDate: string) => ({
  id: 'task-1', projectId: 'project-1', epicId: null, parentId: null,
  title: 'Persist approved requirement', description: 'Retain the exact source requirement.',
  type: 'Task', status: 'To Do', priority: 'Medium', assigneeIds: [],
  reporterId: 'user-1', startDate: '', dueDate, storyPoints: null,
  createdAt: '2026-11-03T00:00:00.000Z', updatedAt: '2026-11-03T00:00:00.000Z',
} as unknown as Task);

const render = (dueDate: string) => renderToStaticMarkup(<TaskCard
  task={task(dueDate)} project={undefined} epic={undefined} users={[]} subtasks={[]}
  onDragStart={() => undefined} onSelectTask={() => undefined} onDeleteTask={() => undefined}
/>);

assert.match(render(''), /Date unassigned/);
assert.match(render('not-a-date'), /Date unassigned/);
assert.match(render('2026-11-03'), /Due Nov 3/);
console.log('Delivery task card: unassigned and invalid dates remain visible without crashing the board.');

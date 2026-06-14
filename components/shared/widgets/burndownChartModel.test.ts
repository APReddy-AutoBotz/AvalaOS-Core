import assert from 'node:assert/strict';
import { Sprint, Task } from '../../../types';
import { buildBurndownChartModel } from './burndownChartModel';

const activeSprint: Sprint = {
    id: 'sprint-active',
    name: 'AP Exception Foundation Review',
    projectId: 'project-ap',
    startDate: '2026-06-10',
    endDate: '2026-06-24',
    status: 'Active',
};

const makeTask = (overrides: Partial<Task>): Task => ({
    id: 'task-1',
    title: 'Task',
    description: 'Task description',
    status: 'To Do',
    priority: 'Medium',
    type: 'Task',
    projectId: 'project-ap',
    sprintId: activeSprint.id,
    assigneeIds: ['user-1'],
    storyPoints: 3,
    startDate: '2026-06-10',
    dueDate: '2026-06-17',
    ...overrides,
});

const assertFiniteModel = (model: ReturnType<typeof buildBurndownChartModel>) => {
    assert.ok(model, 'Expected burndown model to be present');
    assert.equal(model.idealPath.includes('NaN'), false);
    assert.equal(model.actualPath.includes('NaN'), false);
    for (const point of model.points) {
        assert.equal(Number.isFinite(point.x), true);
        assert.equal(Number.isFinite(point.idealY), true);
        assert.equal(Number.isFinite(point.actualY), true);
        assert.equal(Number.isFinite(point.ideal), true);
        assert.equal(Number.isFinite(point.actual), true);
    }
    for (const tick of model.yAxisTicks) {
        assert.equal(Number.isFinite(tick.value), true);
        assert.equal(Number.isFinite(tick.y), true);
    }
};

assert.equal(
    buildBurndownChartModel(activeSprint, []),
    null,
    'Sarah Buyer Viewer with no active-sprint task estimates should use empty state instead of NaN SVG coordinates',
);

assert.equal(
    buildBurndownChartModel(activeSprint, [makeTask({ storyPoints: 0 })]),
    null,
    'Zero story-point tasks should use empty state instead of dividing by zero',
);

assert.equal(
    buildBurndownChartModel({ ...activeSprint, endDate: activeSprint.startDate }, [makeTask({ storyPoints: 5 })]),
    null,
    'One-day sprint should not divide by zero on the x-axis',
);

assertFiniteModel(buildBurndownChartModel(activeSprint, [
    makeTask({ id: 'task-open', storyPoints: 5, status: 'In Progress', dueDate: '2026-06-20' }),
    makeTask({ id: 'task-done', storyPoints: 3, status: 'Done', dueDate: '2026-06-12' }),
]));

console.log('Burndown chart SVG finite regression passed.');

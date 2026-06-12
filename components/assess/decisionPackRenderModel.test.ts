import assert from 'node:assert/strict';
import {
    getBacklogSeedItems,
    getDecisionGovernanceControlItems,
    getDecisionRationaleItems,
    getReadinessValue,
    getRequiredDocumentTypes,
} from './decisionPackRenderModel';
import { AssessmentScoreResult } from '../../types';

const baseScores = {
    supportingScores: {
        handoffReadiness: 87.4,
    },
    decisionPack: {
        recommendedOperatingModel: {
            whyThis: [
                'Workflow has the strongest adjusted priority.',
                'Confidence is high enough for reviewer handoff.',
            ],
        },
        governance: {
            auditControls: ['Score version retained'],
            dataControls: ['Evidence owner recorded'],
            monitoringControls: ['Periodic QA sampling'],
            securityControls: ['Permission checks on review and handoff actions'],
            modelProviderControls: ['Model output review'],
        },
    },
    handoffPack: {
        governanceControls: ['Legacy handoff control'],
        requiredDocumentTypes: ['BRD', 'PDD'],
        suggestedBacklogItems: [
            { type: 'Epic', title: 'Implement workflow orchestration', rationale: 'Seeded from approved Assess recommendation.' },
            { type: 'Task', title: 'Validate controls', rationale: 'Required before delivery.' },
        ],
    },
} as unknown as AssessmentScoreResult;

assert.deepEqual(getDecisionRationaleItems(baseScores), [
    'Workflow has the strongest adjusted priority.',
    'Confidence is high enough for reviewer handoff.',
]);

assert.deepEqual(getDecisionGovernanceControlItems(baseScores), [
    'Score version retained',
    'Evidence owner recorded',
    'Periodic QA sampling',
    'Permission checks on review and handoff actions',
    'Model output review',
]);

assert.deepEqual(getRequiredDocumentTypes(baseScores), ['BRD', 'PDD']);
assert.deepEqual(getBacklogSeedItems(baseScores).map(item => item.title), [
    'Implement workflow orchestration',
    'Validate controls',
]);
assert.equal(getReadinessValue(baseScores, 20), 87);

const handoffOnlyScores = {
    decisionPack: { governance: {} },
    handoffPack: { governanceControls: ['Handoff control fallback'] },
} as unknown as AssessmentScoreResult;

assert.deepEqual(getDecisionGovernanceControlItems(handoffOnlyScores), ['Handoff control fallback']);
assert.equal(getReadinessValue(handoffOnlyScores, 73.5), 74);

const staleShapeScores = {
    decisionPack: {
        whyThisRecommendation: ['stale rationale'],
        governanceControls: ['stale control'],
    },
    handoffPack: {},
} as unknown as AssessmentScoreResult;

assert.doesNotThrow(() => {
    assert.deepEqual(getDecisionRationaleItems(staleShapeScores), []);
    assert.deepEqual(getDecisionGovernanceControlItems(staleShapeScores), []);
    assert.deepEqual(getRequiredDocumentTypes(staleShapeScores), []);
    assert.deepEqual(getBacklogSeedItems(staleShapeScores), []);
    assert.equal(getReadinessValue(staleShapeScores, 44), 44);
});

console.log('Decision Pack render model contract regression passed.');

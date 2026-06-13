import assert from 'node:assert/strict';
import {
    buildOperatingLifecycleSteps,
    formatOperatingLifecycleLabel,
} from './moduleJourneyModel';

console.log('Running ModuleJourney lifecycle copy regression tests...');

const fullLifecycle = buildOperatingLifecycleSteps(['assess', 'docs', 'delivery', 'monitor']);

assert.deepEqual(
    fullLifecycle.map(step => step.label),
    [
        'Avala Assess',
        'Avala Govern Lite',
        'Avala Studio',
        'Avala Delivery Lite',
        'Avala Monitor',
    ],
);

assert.equal(
    formatOperatingLifecycleLabel(fullLifecycle),
    'Avala Assess -> Avala Govern Lite -> Avala Studio -> Avala Delivery Lite -> Avala Monitor',
);

const governLiteStep = fullLifecycle.find(step => step.kind === 'govern-lite');
assert.ok(governLiteStep);
assert.equal(governLiteStep.visualOnly, true);
assert.equal(governLiteStep.outcome, 'Decision controls');
assert.match(governLiteStep.detail, /Deterministic Decision Pack/);
assert.match(governLiteStep.detail, /control card/);
assert.match(governLiteStep.detail, /human review/);
assert.match(governLiteStep.detail, /evidence/);
assert.match(governLiteStep.detail, /assumptions/);
assert.match(governLiteStep.detail, /governed handoff to Studio/);

const unsupportedPhrases = [
    'HIPAA compli' + 'ant',
    'SOC 2 compli' + 'ant',
    'GDPR compli' + 'ant',
    'GxP compli' + 'ant',
    'autonomous deci' + 'sion',
    'agent dec' + 'ides',
    'AI dec' + 'ides sc' + 'ore',
    'AI dec' + 'ides',
    'approved by ' + 'AI',
    'compliance certi' + 'fied',
];

unsupportedPhrases.forEach(phrase => {
    assert.ok(!governLiteStep.detail.toLowerCase().includes(phrase.toLowerCase()));
});

const assessOnlyLifecycle = buildOperatingLifecycleSteps(['assess']);
assert.deepEqual(
    assessOnlyLifecycle.map(step => step.label),
    ['Avala Assess'],
);

const docsOnlyLifecycle = buildOperatingLifecycleSteps(['docs']);
assert.deepEqual(
    docsOnlyLifecycle.map(step => step.label),
    ['Avala Studio'],
);

console.log('ModuleJourney lifecycle copy regression tests passed.');

import assert from 'node:assert/strict';
import {
  createApprovedWorkItemDraft,
  isApprovedWorkItemComplete,
  normalizeApprovedWorkItemDraft,
  splitApprovedAcceptanceCriteria,
} from './StudioApprovedArtifactPublish';
import { deriveRequirementProposals, isApprovedRequirementLine } from '../../services/productAcceptanceBridge/requirementProposals';

const link = { sectionId: 'requirements', sectionTitle: 'Requirements', requirementText: 'FR-1: Reviewer must record a decision.' };

assert.deepEqual(splitApprovedAcceptanceCriteria(' First criterion \n\nSecond criterion '), ['First criterion', 'Second criterion']);
assert.equal(isApprovedWorkItemComplete({ type: 'Task', title: 'Requirement-bound work', description: '', acceptanceCriteria: [], requirementLinks: [link] }), true);
assert.equal(isApprovedWorkItemComplete({ type: 'Task', title: ' ', description: '', acceptanceCriteria: [], requirementLinks: [link] }), false);
assert.equal(isApprovedWorkItemComplete({ type: 'Task', title: 'Requirement-bound work', description: '', acceptanceCriteria: [''], requirementLinks: [link] }), false);
assert.equal(isApprovedWorkItemComplete({ type: 'Task', title: 'Requirement-bound work', description: '', acceptanceCriteria: [], requirementLinks: [] }), false);
assert.equal(isApprovedWorkItemComplete({ type: 'Task', title: 'x'.repeat(301), description: '', acceptanceCriteria: [], requirementLinks: [link] }), false);
const draft = createApprovedWorkItemDraft({ type: 'Task', title: 'Requirement-bound work', description: '', acceptanceCriteria: ['First'], requirementLinks: [link] });
draft.acceptanceCriteriaText = 'First\nSecond\n';
assert.equal(draft.acceptanceCriteriaText, 'First\nSecond\n');
assert.deepEqual(normalizeApprovedWorkItemDraft(draft).acceptanceCriteria, ['First', 'Second']);
assert.equal(isApprovedRequirementLine('### Requirements'), false);
assert.equal(isApprovedRequirementLine('Background information only.'), false);
assert.equal(isApprovedRequirementLine('FR-1: Reviewer must record a decision.'), true);
assert.equal(isApprovedRequirementLine('- The workflow shall preserve the approved source link.'), true);

const derived = deriveRequirementProposals({ title: 'Approved BRD', sections: [{ id: 'requirements', title: 'Requirements', body: [
  'Background information only.',
  'FR-1: Reviewer must record a decision.',
  '- The workflow shall preserve the approved source link.',
  'AC-1: The recorded decision is visible after reload.',
].join('\n') }] });
assert.equal(derived.blockedReason, null);
assert.equal(derived.requirementCount, 3);
assert.deepEqual(derived.proposals.map(item => item.type), ['Epic', 'Story', 'Story', 'Task']);
assert.ok(derived.proposals.every(item => item.requirementLinks.length > 0));
assert.ok(derived.proposals.every(item => item.requirementLinks.every(value => value.sectionId === 'requirements')));
assert.doesNotMatch(derived.proposals[0].title, /Requirements/u, 'epics must not be a renamed document heading');
assert.match(derived.proposals[0].title, /reviewer: record a decision/i);
assert.notEqual(derived.proposals[1].title, derived.proposals[1].description, 'story title and body must express distinct delivery information');
assert.deepEqual(derived.proposals[1].acceptanceCriteria, ['The recorded decision is visible after reload.']);
assert.equal(derived.proposals[1].requirementLinks.length, 2, 'the story retains both its requirement and directly paired acceptance predicate');
const crossSection = deriveRequirementProposals({ sections: [
  { id: 'functional', title: 'Functional requirements', body: 'FR-2: The board must persist status updates.' },
  { id: 'acceptance', title: 'Acceptance criteria', body: 'AC-2: For FR-2, the status update is visible after reload.' },
] });
assert.deepEqual(crossSection.proposals.map(item => item.type), ['Epic', 'Story', 'Task']);
assert.deepEqual(crossSection.proposals[1].acceptanceCriteria, ['For FR-2, the status update is visible after reload.']);
assert.equal(crossSection.proposals[1].requirementLinks.length, 2, 'matching stable requirement numbers link acceptance from another section');
const ambiguousAcceptance = deriveRequirementProposals({ sections: [{ id: 'requirements', title: 'Requirements', body: [
  'FR-1: Reviewer must record a decision.',
  'FR-2: Board must persist the decision.',
  'AC-1: The decision is visible after reload.',
].join('\n') }] });
assert.deepEqual(ambiguousAcceptance.proposals.map(item => item.type), ['Epic', 'Story', 'Story', 'Task', 'Task']);
assert.match(ambiguousAcceptance.proposals[3].title, /Review unassigned acceptance criteria/u);
assert.match(ambiguousAcceptance.proposals[3].description, /human must assign or retain/i);
const acceptanceOnly = deriveRequirementProposals({ sections: [{ id: 'acceptance', title: 'Acceptance criteria', body: 'AC-1: The result is visible.' }] });
assert.equal(acceptanceOnly.proposals.length, 0);
assert.match(acceptanceOnly.blockedReason ?? '', /no approved deliverable requirement/i);
const headingOnly = deriveRequirementProposals({ title: 'Approved BRD', sections: [{ id: 'scope', title: 'Scope', body: 'Overview only.' }] });
assert.equal(headingOnly.proposals.length, 0);
assert.match(headingOnly.blockedReason ?? '', /No explicit requirement statement/);
console.log('Studio approved-artifact proposal review: exact requirement derivation, heading rejection, and bounded validation passed');

import assert from 'node:assert/strict';
import {
  createApprovedWorkItemDraft,
  isApprovedWorkItemComplete,
  normalizeApprovedWorkItemDraft,
  splitApprovedAcceptanceCriteria,
  updateApprovedWorkItemDependency,
} from './StudioApprovedArtifactPublish';
import { deriveRequirementProposals, isApprovedRequirementLine } from '../../services/productAcceptanceBridge/requirementProposals';

const link = { sectionId: 'requirements', sectionTitle: 'Requirements', requirementText: 'FR-1: Reviewer must record a decision.' };

assert.deepEqual(splitApprovedAcceptanceCriteria(' First criterion \n\nSecond criterion '), ['First criterion', 'Second criterion']);
assert.equal(isApprovedWorkItemComplete({ proposalRole: 'implementation', type: 'Task', title: 'Requirement-bound work', description: '', acceptanceCriteria: [], requirementLinks: [link] }), true);
assert.equal(isApprovedWorkItemComplete({ proposalRole: 'discovery', type: 'Task', title: 'Resolve ownership', description: '', acceptanceCriteria: [], requirementLinks: [link] }), true);
assert.equal(isApprovedWorkItemComplete({ proposalRole: 'implementation', type: 'Task', title: ' ', description: '', acceptanceCriteria: [], requirementLinks: [link] }), false);
assert.equal(isApprovedWorkItemComplete({ proposalRole: 'implementation', type: 'Task', title: 'Requirement-bound work', description: '', acceptanceCriteria: [''], requirementLinks: [link] }), false);
assert.equal(isApprovedWorkItemComplete({ proposalRole: 'implementation', type: 'Task', title: 'Requirement-bound work', description: '', acceptanceCriteria: [], requirementLinks: [] }), false);
assert.equal(isApprovedWorkItemComplete({ proposalRole: 'implementation', type: 'Task', title: 'x'.repeat(301), description: '', acceptanceCriteria: [], requirementLinks: [link] }), false);
const draft = createApprovedWorkItemDraft({ proposalRole: 'implementation', type: 'Story', title: 'Requirement-bound work', description: '', acceptanceCriteria: ['First'], requirementLinks: [link] });
draft.acceptanceCriteriaText = 'First\nSecond\n';
assert.equal(draft.acceptanceCriteriaText, 'First\nSecond\n');
assert.deepEqual(normalizeApprovedWorkItemDraft(draft).acceptanceCriteria, ['First', 'Second']);
draft.type = 'Task';
assert.equal(normalizeApprovedWorkItemDraft(draft).proposalRole, 'implementation',
  'an allowed Story-to-Task edit preserves immutable implementation identity');
const withDependency = updateApprovedWorkItemDependency(draft, 4, true);
assert.deepEqual(withDependency.dependencyProposalIndices, [4]);
assert.deepEqual(updateApprovedWorkItemDependency(withDependency, 4, false).dependencyProposalIndices, [],
  'the reviewer can explicitly add and remove a discovery dependency before publication');
assert.equal(isApprovedRequirementLine('### Requirements'), false);
assert.equal(isApprovedRequirementLine('Background information only.'), false);
assert.equal(isApprovedRequirementLine('FR-1: Reviewer must record a decision.'), true);
assert.equal(isApprovedRequirementLine('REQ-8: The reviewer must record an approval decision for each proposal.'), true);
assert.equal(isApprovedRequirementLine('- The workflow shall preserve the approved source link.'), true);

const sourceFactsSentinel = 'Source facts from the accepted Assess handoff (for human review; not model-generated reasoning):';
const numberedRequirements = [
  '1. Capture supplier query details including email, received time, requester, and invoice references, and acknowledge within two working days.',
  '2. Verify requester authority by checking supplier contact records before disclosing invoice status.',
  '3. Extract invoice references accurately without inferring missing numbers; handle multiple or ambiguous requests via human intervention.',
  '4. Use approved read-only GET API to retrieve invoice status, matching invoiceId and supplierId exactly.',
  '5. Draft responses based on verified status; only humans may approve and send replies.',
  '6. Record original source and human-approved responses for audit; retention duration is an open question.',
  '7. Resolve ambiguities, disputes, and exceptions through human investigation; route bank-detail requests to independent finance procedures.',
  '8. Exclude the prohibited bank-details POST. PATCH support remains unknown and excluded pending separate evidence and authorization.',
  '9. Maintain audit and monitoring controls including data classification before AI access.',
  '10. Support a hybrid operating model combining automation and human approval components.',
  '11. Address unresolved evidence and technical questions before implementation.',
];
const numberedResult = deriveRequirementProposals({ title: 'Supplier invoice BRD', sections: [
  { id: 'summary', title: 'Summary', body: 'The process must acknowledge every query, but this modal summary is not a requirement source.' },
  { id: 'requirements', title: 'Requirements', body: [
    ...numberedRequirements,
    '',
    sourceFactsSentinel,
    '1. Capture this server-authored source-fact list item only as evidence, never as another requirement.',
    '  - Rules: The process must retain source evidence.',
  ].join('\n') },
  { id: 'appendix', title: 'Appendix', body: '1. Capture a narrative example.\nThe appendix must remain contextual.' },
] });
assert.equal(numberedResult.blockedReason, null);
assert.equal(numberedResult.requirementCount, 11);
assert.deepEqual(numberedResult.proposals.map(item => item.type), ['Epic', ...Array(11).fill('Story'), 'Task']);
assert.deepEqual(numberedResult.proposals.slice(1, 12).map(item => item.requirementLinks[0]), numberedRequirements.map(requirementText => ({
  sectionId: 'requirements', sectionTitle: 'Requirements', requirementText,
})), 'numbering plus the exact approved section identity and text remains source-bound');
assert.ok(numberedResult.proposals.some(item => item.requirementLinks.some(value =>
  value.requirementText.includes('PATCH support remains unknown and excluded pending separate evidence and authorization')))
  && numberedResult.proposals.every(item => item.requirementLinks.every(value =>
    !value.requirementText.includes('PATCH unavailable'))),
'unknown PATCH support remains unknown in requirement-derived work rather than becoming unavailable');
assert.ok(numberedResult.proposals.flatMap(item => item.requirementLinks)
  .every(value => value.sectionId === 'requirements' && !value.requirementText.includes('source-fact')),
'summary, appendix and the server-authored source-facts tail cannot become implementation requirements');

const explicitOutsideRequirementSection = deriveRequirementProposals({ sections: [
  { id: 'requirements', title: 'Requirements', body: '1. Capture the approved request.' },
  { id: 'appendix', title: 'Appendix', body: 'FR-9: The board must retain the exact approved source.\nThis appendix must not otherwise become work.' },
  { id: 'acceptance', title: 'Acceptance criteria', body: 'AC-9: For FR-9, the exact source is visible after reload.' },
] });
assert.equal(explicitOutsideRequirementSection.requirementCount, 3,
  'explicit FR/AC identities remain eligible in otherwise allowed sections while incidental modal prose is suppressed');
assert.ok(explicitOutsideRequirementSection.proposals.some(item => item.proposalRole === 'implementation'
  && item.requirementLinks.some(value => value.requirementText.startsWith('FR-9:'))));
assert.ok(explicitOutsideRequirementSection.proposals.find(item => item.requirementLinks
  .some(value => value.requirementText.startsWith('FR-9:')))?.requirementLinks.some(value => value.requirementText.startsWith('AC-9:')));

const duplicateNumbered = deriveRequirementProposals({ sections: [
  { id: 'businessRequirements', title: 'Business Requirements', body: '1. Capture the approved request.' },
  { id: 'functional_requirements', title: 'Functional Requirements', body: '1. The reviewer must verify the approved request.' },
] });
assert.equal(duplicateNumbered.proposals.length, 0);
assert.match(duplicateNumbered.blockedReason ?? '', /numbered requirement identity “1” appears more than once/i);

const numberedNonRequirements = deriveRequirementProposals({ sections: [{
  id: 'requirements', title: 'Requirements', body: '1. Background context.\n2. What happens next?\n3. Proposed integration choice.',
}] });
assert.equal(numberedNonRequirements.proposals.length, 0);
assert.match(numberedNonRequirements.blockedReason ?? '', /No explicit requirement statement/);
const excludedRequirementHeadingKeepsLegacyFallback = deriveRequirementProposals({ sections: [
  { id: 'questions_requirements', title: 'Proposed Requirements', body: '1. Capture an unapproved proposal.' },
  { id: 'summary', title: 'Summary', body: 'The approved workflow must preserve its source.' },
] });
assert.equal(excludedRequirementHeadingKeepsLegacyFallback.requirementCount, 1,
  'an excluded proposal heading cannot suppress the established modal fallback when no explicit approved requirement section exists');

const derived = deriveRequirementProposals({ title: 'Approved BRD', sections: [{ id: 'requirements', title: 'Requirements', body: [
  'Background information only.',
  'FR-1: Reviewer must record a decision.',
  '- The workflow shall preserve the approved source link.',
  'AC-1: For FR-1, the recorded decision is visible after reload.',
].join('\n') }] });
assert.equal(derived.blockedReason, null);
assert.equal(derived.requirementCount, 3);
assert.deepEqual(derived.proposals.map(item => item.type), ['Epic', 'Story', 'Story', 'Task']);
assert.ok(derived.proposals.every(item => item.requirementLinks.length > 0));
assert.ok(derived.proposals.every(item => item.requirementLinks.every(value => value.sectionId === 'requirements')));
assert.doesNotMatch(derived.proposals[0].title, /Requirements/u, 'epics must not be a renamed document heading');
assert.match(derived.proposals[0].title, /reviewer: record a decision/i);
assert.notEqual(derived.proposals[1].title, derived.proposals[1].description, 'story title and body must express distinct delivery information');
assert.deepEqual(derived.proposals[1].acceptanceCriteria, ['For FR-1, the recorded decision is visible after reload.']);
assert.equal(derived.proposals[1].requirementLinks.length, 2, 'the story retains both its requirement and directly paired acceptance predicate');
const crossSection = deriveRequirementProposals({ sections: [
  { id: 'functional', title: 'Functional requirements', body: 'FR-2: The board must persist status updates.' },
  { id: 'acceptance', title: 'Acceptance criteria', body: 'AC-2: For FR-2, the status update is visible after reload.' },
] });
assert.deepEqual(crossSection.proposals.map(item => item.type), ['Epic', 'Story', 'Task']);
assert.deepEqual(crossSection.proposals[1].acceptanceCriteria, ['For FR-2, the status update is visible after reload.']);
assert.equal(crossSection.proposals[1].requirementLinks.length, 2, 'an explicit requirement-ID reference links acceptance from another section');
const ambiguousAcceptance = deriveRequirementProposals({ sections: [{ id: 'requirements', title: 'Requirements', body: [
  'FR-1: Reviewer must record a decision.',
  'FR-2: Board must persist the decision.',
  'AC-1: The decision is visible after reload.',
].join('\n') }] });
assert.deepEqual(ambiguousAcceptance.proposals.map(item => item.type), ['Epic', 'Story', 'Story', 'Task', 'Task']);
assert.match(ambiguousAcceptance.proposals[3].title, /Review unassigned acceptance criteria/u);
assert.match(ambiguousAcceptance.proposals[3].description, /human must assign or retain/i);
for (const proposal of ambiguousAcceptance.proposals.filter(item => item.proposalRole !== 'acceptance-review')) {
  assert.ok(proposal.requirementLinks.every(link => !link.requirementText.startsWith('AC-1:')),
    'only the review task can carry the unresolved criterion onto the board');
}
const explicitMissingTarget = deriveRequirementProposals({ sections: [{ id: 'requirements', title: 'Requirements', body: [
  'FR-1: Reviewer must record a decision.',
  'AC-2: For FR-2, the missing requirement is visible after reload.',
].join('\n') }] });
assert.equal(explicitMissingTarget.proposals[1].requirementLinks.length, 1,
  'an explicit reference to a missing requirement cannot fall back to the only requirement in its section');
assert.equal(explicitMissingTarget.proposals[2].proposalRole, 'acceptance-review');
assert.ok(explicitMissingTarget.proposals[2].requirementLinks[0].requirementText.startsWith('AC-2:'));
const duplicateIdentifier = deriveRequirementProposals({ sections: [
  { id: 'one', title: 'First requirements', body: 'FR-1: Reviewer must record a decision.' },
  { id: 'two', title: 'Second requirements', body: 'FR-1: Board must persist the decision.\nAC-1: For FR-1, the decision is visible.' },
] });
assert.equal(duplicateIdentifier.proposals.filter(item => item.proposalRole === 'acceptance-review').length, 1,
  'an explicit reference to a duplicated requirement identifier remains for human review');
const sharedAcceptance = deriveRequirementProposals({ sections: [
  { id: 'functional', title: 'Functional requirements', body: 'FR-1: Reviewer must decide.\nFR-2: Board must persist the decision.' },
  { id: 'acceptance', title: 'Acceptance criteria', body: 'AC-1: For FR-1 and FR-2, the persisted decision is visible.' },
] });
assert.deepEqual(sharedAcceptance.proposals.map(item => item.type), ['Epic', 'Story', 'Story', 'Task']);
assert.ok(sharedAcceptance.proposals[1].requirementLinks.some(value => value.requirementText.startsWith('AC-1:')));
assert.ok(sharedAcceptance.proposals[2].requirementLinks.some(value => value.requirementText.startsWith('AC-1:')),
  'one acceptance criterion that explicitly references two requirement IDs remains linked to both');
assert.deepEqual(derived.proposals.map(item => item.proposalRole), ['coordination', 'implementation', 'implementation', 'verification']);
const excludedSections = deriveRequirementProposals({ sections: [
  { id: 'requirements', title: 'Requirements', body: 'FR-1: Board must persist status.' },
  { id: 'openQuestionsAndProposals', title: 'Open questions and proposals', body: 'Open question: The design must choose an unspecified API?' },
  { id: 'asIsFlow', title: 'As-Is Flow', body: 'flowchart TD\nA[Operator must review] --> B[Complete]' },
  { id: 'assumptions', title: 'Assumptions', body: 'The solution shall have an unspecified integration.' },
] });
assert.equal(excludedSections.requirementCount, 1);
const discovery = excludedSections.proposals.find(item => item.proposalRole === 'discovery');
assert.ok(discovery, 'an approved unanswered question becomes an explicit discovery task');
assert.equal(discovery?.requirementLinks[0].sectionId, 'openQuestionsAndProposals');
assert.deepEqual(discovery?.acceptanceCriteria, [
  'A different authorized reviewer accepts a source-backed answer or approves a nonblocking disposition or revised scope. Question: The design must choose an unspecified API? Recording the unanswered question alone does not release dependent work.',
]);
assert.equal(discovery?.acceptanceCriteria.some(value => /retain(?:s|ed)? the question as unresolved/iu.test(value)), false,
  'an unresolved question is not a discovery-task completion outcome');
assert.ok(excludedSections.proposals.filter(item => item.proposalRole === 'implementation')
  .every(item => item.dependencyProposalIndices === undefined),
  'an unanswered question without an explicit requirement reference does not manufacture an implementation dependency');
assert.ok(excludedSections.proposals.filter(item => item.proposalRole !== 'discovery')
  .flatMap(item => item.requirementLinks).every(value => value.sectionId === 'requirements'),
  'questions never become implementation requirements');
const explicitDiscoveryDependency = deriveRequirementProposals({ sections: [
  { id: 'requirements', title: 'Requirements', body: 'FR-1: Board must persist status.\nFR-2: Reviewer must acknowledge exceptions.' },
  { id: 'openQuestions', title: 'Open questions', body: 'Open question: Which API contract must FR-1 use?\nOpen question: Is the vendor roadmap known?' },
] });
const explicitDiscovery = explicitDiscoveryDependency.proposals.findIndex(item => item.proposalRole === 'discovery'
  && item.requirementLinks[0].requirementText.includes('FR-1'));
const unrelatedDiscovery = explicitDiscoveryDependency.proposals.findIndex(item => item.proposalRole === 'discovery'
  && item.requirementLinks[0].requirementText.includes('vendor roadmap'));
assert.ok(explicitDiscovery >= 0 && unrelatedDiscovery >= 0);
assert.match(explicitDiscoveryDependency.proposals[explicitDiscovery].acceptanceCriteria[0],
  /different authorized reviewer accepts a source-backed answer or approves a nonblocking disposition or revised scope.*Recording the unanswered question alone does not release dependent work/iu,
  'the discovery task itself requires independent acceptance or disposition rather than retaining the question');
assert.deepEqual(explicitDiscoveryDependency.proposals.find(item => item.proposalRole === 'implementation'
  && item.requirementLinks[0].requirementText.startsWith('FR-1:'))?.dependencyProposalIndices, [explicitDiscovery],
  'an explicit unique requirement reference derives only the matching discovery dependency');
assert.match(explicitDiscoveryDependency.proposals.find(item => item.proposalRole === 'implementation'
  && item.requirementLinks[0].requirementText.startsWith('FR-1:'))?.acceptanceCriteria.at(-1) ?? '',
  /remains blocking until a different authorized reviewer accepts a source-backed answer or approves a nonblocking disposition or revised scope/iu,
  'the dependent implementation criterion cannot treat recording an unresolved question as release');
assert.equal(explicitDiscoveryDependency.proposals.find(item => item.proposalRole === 'implementation'
  && item.requirementLinks[0].requirementText.startsWith('FR-2:'))?.dependencyProposalIndices, undefined,
  'an unrelated implementation proposal does not inherit an open question dependency');
const acceptanceOnly = deriveRequirementProposals({ sections: [{ id: 'acceptance', title: 'Acceptance criteria', body: 'AC-1: The result is visible.' }] });
assert.equal(acceptanceOnly.proposals.length, 0);
assert.match(acceptanceOnly.blockedReason ?? '', /no approved deliverable requirement/i);
const headingOnly = deriveRequirementProposals({ title: 'Approved BRD', sections: [{ id: 'scope', title: 'Scope', body: 'Overview only.' }] });
assert.equal(headingOnly.proposals.length, 0);
assert.match(headingOnly.blockedReason ?? '', /No explicit requirement statement/);
console.log('Studio approved-artifact proposal review: exact requirement derivation, heading rejection, and bounded validation passed');

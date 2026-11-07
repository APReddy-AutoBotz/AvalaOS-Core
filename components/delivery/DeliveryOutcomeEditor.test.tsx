import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DeliveryOutcomeEditor from './DeliveryOutcomeEditor';
import type { DeliveryOutcome } from '../../services/productAcceptanceBridge/contracts';

const id = (value: number) => `${String(value).padStart(8, '0')}-0000-4000-8000-${String(value).padStart(12, '0')}`;
const actor = id(1);
const reviewer = id(2);
const scope = { actorId: actor, organizationId: id(3), workspaceId: id(4), authorizationVersion: 7 };
const base: DeliveryOutcome = {
  outcomeId: id(5), version: 2, taskId: id(6), taskVersion: 4, projectId: id(7),
  status: 'achieved', label: 'Discovery independently resolved', detail: 'The exact accepted decision is committed.',
  documentGenerationId: id(8), studioArtifactId: id(9), studioArtifactVersionId: id(10),
  recordedBy: reviewer, recordedAt: '2026-11-07T10:00:00.000Z',
};
const task = { taskId: base.taskId, taskVersion: base.taskVersion, title: 'Resolve API evidence', projectId: base.projectId };
const question = 'Is the API operation supported and authorized?';

const acceptedAnswer = renderToStaticMarkup(<DeliveryOutcomeEditor
  scope={scope} task={task} discoveryQuestion={question} currentOutcome={{
    ...base,
    discoveryResolution: {
      disposition: 'source_backed_answer_accepted', question, answer: 'Use the reviewed read API.',
      evidenceAttestationId: id(11), revisedScope: null,
    },
  }} disabled
/>);
assert.match(acceptedAnswer, /<option value="source_backed_answer_accepted" selected="">Independently accepted source-backed answer<\/option>/);
assert.doesNotMatch(acceptedAnswer, /<option value="blocking_unresolved" selected="">/);

const approvedScope = renderToStaticMarkup(<DeliveryOutcomeEditor
  scope={scope} task={task} discoveryQuestion={question} currentOutcome={{
    ...base,
    discoveryResolution: {
      disposition: 'approved_nonblocking_scope', question, answer: null,
      evidenceAttestationId: null, revisedScope: 'Exclude the optional operation pending evidence.',
    },
  }} disabled
/>);
assert.match(approvedScope, /<option value="approved_nonblocking_scope" selected="">Independently approved revised scope<\/option>/);
assert.doesNotMatch(approvedScope, /<option value="blocking_unresolved" selected="">/);

const selfProposed = renderToStaticMarkup(<DeliveryOutcomeEditor
  scope={scope} task={task} discoveryQuestion={question} currentOutcome={{
    ...base,
    recordedBy: actor,
    discoveryResolution: {
      disposition: 'source_backed_answer_proposed', question, answer: 'Proposed answer.',
      evidenceAttestationId: id(11), revisedScope: null,
    },
  }}
/>);
assert.doesNotMatch(selfProposed, /value="source_backed_answer_accepted"/,
  'the proposer must not receive an independent-acceptance action');

console.log('Delivery discovery editor: committed accepted dispositions remain visible and self-acceptance stays unavailable.');

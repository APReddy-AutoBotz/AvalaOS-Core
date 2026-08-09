import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import spec from '../config/pilot-acceptance-spec.json' with { type: 'json' };

const authoritative = process.argv.includes('--authoritative');
const checkedOutHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const head = process.env.PILOT_ACCEPTANCE_HEAD || checkedOutHead;
const run = {
  id: process.env.GITHUB_RUN_ID || null,
  attempt: process.env.GITHUB_RUN_ATTEMPT || null,
  workflow: process.env.GITHUB_WORKFLOW || 'local',
  actions: process.env.GITHUB_ACTIONS || null,
  event: process.env.GITHUB_EVENT_NAME || null,
  ref: process.env.GITHUB_REF || null,
  headRef: process.env.GITHUB_HEAD_REF || null,
  baseRef: process.env.GITHUB_BASE_REF || null,
};

const expectedRepository = 'APReddy-AutoBotz/AvalaOS-Core';

export const validateActionsRun = (metadata, context) => {
  if (!metadata || typeof metadata !== 'object') return false;
  const pullNumber = context.ref?.match(/^refs\/pull\/(\d+)\/merge$/u)?.[1];
  const pull = Array.isArray(metadata.pull_requests)
    ? metadata.pull_requests.find(candidate => String(candidate?.number) === pullNumber)
    : null;
  const pullRequestMatches = context.event === 'pull_request'
    && Boolean(pullNumber)
    && pull?.head?.sha === context.head
    && pull?.head?.ref === context.headRef
    && pull?.base?.ref === context.baseRef;
  const dispatchMatches = context.event === 'workflow_dispatch'
    && context.ref === `refs/heads/${metadata.head_branch}`
    && metadata.head_sha === context.head;

  return String(metadata.id) === context.runId
    && metadata.name === 'Pilot Acceptance'
    && metadata.event === context.event
    && metadata.head_sha === context.head
    && metadata.repository?.full_name === expectedRepository
    && metadata.head_repository?.full_name === expectedRepository
    && (pullRequestMatches || dispatchMatches);
};

export const validateOidcClaims = (claims, context) => claims?.iss === 'https://token.actions.githubusercontent.com'
  && claims?.aud === 'avalaos-pilot-acceptance'
  && claims?.repository === expectedRepository
  && claims?.workflow === 'Pilot Acceptance'
  && claims?.event_name === context.event
  && claims?.ref === context.ref
  && claims?.sha === context.actionsSha
  && String(claims?.run_id) === context.runId
  && String(claims?.run_attempt) === context.runAttempt
  && Number(claims?.exp) > Math.floor(Date.now() / 1000)
  && Number(claims?.nbf || 0) <= Math.floor(Date.now() / 1000);

const verifyOidcIdentity = async context => {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) return false;
  const separator = requestUrl.includes('?') ? '&' : '?';
  const tokenResponse = await fetch(`${requestUrl}${separator}audience=avalaos-pilot-acceptance`, {
    headers: { Authorization: `Bearer ${requestToken}` },
    redirect: 'error',
  });
  if (!tokenResponse.ok) return false;
  const jwt = (await tokenResponse.json())?.value;
  const parts = typeof jwt === 'string' ? jwt.split('.') : [];
  if (parts.length !== 3) return false;
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return false;
  const discovery = await fetch('https://token.actions.githubusercontent.com/.well-known/openid-configuration', { redirect: 'error' });
  if (!discovery.ok) return false;
  const jwksUri = (await discovery.json())?.jwks_uri;
  if (typeof jwksUri !== 'string' || !jwksUri.startsWith('https://token.actions.githubusercontent.com/')) return false;
  const jwksResponse = await fetch(jwksUri, { redirect: 'error' });
  if (!jwksResponse.ok) return false;
  const key = (await jwksResponse.json())?.keys?.find(candidate => candidate.kid === header.kid);
  if (!key) return false;
  const signatureValid = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    crypto.createPublicKey({ key, format: 'jwk' }),
    Buffer.from(parts[2], 'base64url'),
  );
  return signatureValid && validateOidcClaims(claims, context);
};

const verifyActionsRun = async () => {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (repository !== expectedRepository || !token || !hasAuthoritativeRun) return false;
  const response = await fetch(`https://api.github.com/repos/${repository}/actions/runs/${run.id}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    redirect: 'error',
  });
  if (!response.ok) return false;
  const context = {
    runId: run.id,
    runAttempt: run.attempt,
    actionsSha: process.env.GITHUB_SHA,
    event: run.event,
    ref: run.ref,
    headRef: run.headRef,
    baseRef: run.baseRef,
    head,
  };
  return validateActionsRun(await response.json(), context) && await verifyOidcIdentity(context);
};

let supplied = {};
let parseError = null;
try {
  supplied = JSON.parse(process.env.PILOT_ACCEPTANCE_GATE_RESULTS || '{}');
  if (!supplied || Array.isArray(supplied) || typeof supplied !== 'object') {
    parseError = 'PILOT_ACCEPTANCE_GATE_RESULTS must be a JSON object';
    supplied = {};
  }
} catch {
  parseError = 'PILOT_ACCEPTANCE_GATE_RESULTS must be valid JSON';
}

const candidateMatches = head === checkedOutHead;
const hasAuthoritativeRun = typeof run.id === 'string' && /^\d+$/u.test(run.id);
const hasPilotWorkflowIdentity = run.actions === 'true' && run.workflow === 'Pilot Acceptance';
const hasAuthoritativeEventRef = (
  run.event === 'pull_request'
  && typeof run.ref === 'string'
  && /^refs\/pull\/\d+\/merge$/u.test(run.ref)
  && typeof run.headRef === 'string'
  && run.headRef.length > 0
  && run.baseRef === 'main'
) || (
  run.event === 'workflow_dispatch'
  && typeof run.ref === 'string'
  && /^refs\/heads\/.+/u.test(run.ref)
);
const hasAuthoritativeContext = hasAuthoritativeRun && hasPilotWorkflowIdentity && hasAuthoritativeEventRef;
let hasVerifiedActionsRun = false;
if (authoritative && candidateMatches && hasAuthoritativeContext) {
  try {
    hasVerifiedActionsRun = await verifyActionsRun();
  } catch {
    hasVerifiedActionsRun = false;
  }
}
const gates = spec.requiredGates.map(id => {
  const evidence = supplied[id];
  const wellFormed = evidence !== null
    && !Array.isArray(evidence)
    && typeof evidence === 'object'
    && ['passed', 'failed'].includes(evidence.result)
    && typeof evidence.command === 'string'
    && evidence.command.trim().length > 0
    && typeof evidence.runId === 'string'
    && evidence.runId.length > 0;
  const provenanceMatches = wellFormed && evidence.runId === run.id;
  const accepted = evidence?.result === 'passed'
    && (!authoritative || (candidateMatches && hasAuthoritativeContext && hasVerifiedActionsRun && provenanceMatches && !parseError));

  if (accepted) {
    return { id, classification: 'proven_disposable_pilot_evidence', result: 'passed', command: evidence.command, runId: evidence.runId };
  }

  return {
    id,
    classification: authoritative ? 'failed' : 'configured_not_live_verified',
    result: authoritative ? 'failed' : 'pending',
    command: wellFormed ? evidence.command : null,
    runId: wellFormed ? evidence.runId : null,
  };
});
const passed = gates.every(gate => gate.result === 'passed');
const report = {
  schemaVersion: spec.schemaVersion,
  candidate: { head, checkedOutHead, requiredBaseline: spec.requiredBaseline },
  run,
  scope: spec.scope,
  result: passed ? 'passed' : authoritative ? 'failed' : 'pending',
  gates,
  hostedLive: { classification: 'not_proven_hosted_live', result: 'not_proven' },
  limitations: spec.limitations,
};
fs.mkdirSync('artifacts/pilot-acceptance', { recursive: true });
fs.writeFileSync('artifacts/pilot-acceptance/manifest.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`Pilot acceptance manifest: ${report.result}; ${gates.filter(gate => gate.result === 'passed').length}/${gates.length} required gates passed.`);
if (parseError) console.error(parseError);
if (authoritative && !candidateMatches) console.error('PILOT_ACCEPTANCE_HEAD must match the exact checked-out candidate.');
if (authoritative && !hasAuthoritativeRun) console.error('GITHUB_RUN_ID must identify the current authoritative workflow run.');
if (authoritative && !hasPilotWorkflowIdentity) console.error('Authoritative evidence requires the GitHub Actions Pilot Acceptance workflow.');
if (authoritative && !hasAuthoritativeEventRef) console.error('Authoritative evidence requires an accepted Pilot Acceptance event and ref context.');
if (authoritative && !hasVerifiedActionsRun) console.error('Authoritative evidence requires authenticated metadata for the current GitHub Actions Pilot Acceptance run.');
if (authoritative && !passed) process.exitCode = 1;

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import AuthenticatedHostedPlaywrightReporter from './authenticatedHostedPlaywrightReporter.mjs';
import { validateAuthenticatedHostedPlaywrightDiagnostic } from './authenticatedHostedDiagnostics.mjs';

const execFileAsync = promisify(execFile);

const titles = new Map([
  ['authors, replays, rejects stale work, requests changes and resubmits through the production UI', 'primary-lifecycle'],
  ['independent approval, Govern separation and synthetic Studio generation retain exact lineage', 'govern-studio-lifecycle'],
  ['independent reviewer rejects a separate current decision without mutating the approved primary chain', 'independent-rejection'],
  ['approved Studio work publishes through legacy Docs and Delivery into read-only Monitor', 'delivery-monitor'],
  ['production scoring preserves low-suitability and strong-automation decisions through governed publication', 'scoring-policy'],
  ['authenticated Admin, AI and private Studio controls use server authority and measured storage boundaries', 'authenticated-controls'],
]);
const fixture = title => ({ title, expectedStatus: 'passed', parent: { project: () => ({ name: 'desktop-chromium' }) } });

test('Govern and Studio diagnostic step labels map to fixed allowlisted operations', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'authenticated-govern-studio-reporter-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const prior = process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
  t.after(() => { if (prior === undefined) delete process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
    else process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH = prior; });
  for (const [label, operation] of [
    ['reviewer-approval', 'GOVERN_STUDIO_REVIEWER_APPROVAL'],
    ['reviewer-denial', 'GOVERN_STUDIO_REVIEWER_DENIAL'],
    ['approver-resolution', 'GOVERN_STUDIO_APPROVER_RESOLUTION'],
    ['assess-handoff', 'GOVERN_STUDIO_ASSESS_HANDOFF'],
    ['studio-request', 'GOVERN_STUDIO_STUDIO_REQUEST'],
    ['studio-review', 'GOVERN_STUDIO_STUDIO_REVIEW'],
    ['studio-final-accept', 'GOVERN_STUDIO_STUDIO_FINAL_ACCEPT'],
    ['source-consume', 'GOVERN_STUDIO_SOURCE_CONSUME'],
    ['checkpoint', 'GOVERN_STUDIO_CHECKPOINT'],
  ]) {
    const destination = path.join(root, `${label}.json`);
    process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH = destination;
    const reporter = new AuthenticatedHostedPlaywrightReporter();
    const current = fixture('independent approval, Govern separation and synthetic Studio generation retain exact lineage');
    const error = new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_TIMEOUT');
    const step = { title: `hosted:govern-studio:${label}`, error };
    reporter.onTestBegin(current); reporter.onStepBegin(current, {}, step);
    reporter.onStepEnd(current, { status: 'failed' }, step);
    reporter.onTestEnd(current, { status: 'failed', error });
    await reporter.onEnd({ status: 'failed' });
    const value = JSON.parse(await readFile(destination, 'utf8'));
    assert.equal(value.operation, operation);
    assert.equal(value.testCategory, 'govern-studio-lifecycle');
    assert.ok(validateAuthenticatedHostedPlaywrightDiagnostic(value));
    assert.equal(JSON.stringify(value).includes(label), false);
  }
});

test('actor timing keeps only bounded fixed phases from the failed boundary, preserving the failure', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'authenticated-phase-reporter-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const prior = process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
  t.after(() => {
    if (prior === undefined) delete process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
    else process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH = prior;
  });
  process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH = path.join(root, 'diagnostic.json');
  const reporter = new AuthenticatedHostedPlaywrightReporter(), current = fixture([...titles.keys()][0]);
  const primary = { message: 'AUTHENTICATED_BROWSER_ACTOR_TRANSITION_EMPTY_AFTER_DEADLINE' };
  reporter.onTestBegin(current);
  reporter.onStepBegin(current, {}, { title: 'hosted:actor-boundary' });
  reporter.onStepEnd(current, {}, { title: 'hosted:actor-phase:drain', duration: 999 });
  reporter.onStepEnd(current, {}, { title: 'hosted:actor-boundary', error: { message: 'caught-earlier' } });
  reporter.onStepBegin(current, {}, { title: 'hosted:actor-boundary' });
  for (const [phase, duration] of [['admissions-first', 30.2], ['drain', 15000], ['drain', 10],
    ['secret-canary', 1], ['bodies-first', Infinity]]) {
    reporter.onStepEnd(current, {}, { title: `hosted:actor-phase:${phase}`, duration });
  }
  reporter.onStepEnd(current, {}, { title: 'hosted:actor-boundary', error: primary });
  // A cleanup boundary must not overwrite the timing of the original failure.
  reporter.onStepBegin(current, {}, { title: 'hosted:actor-boundary' });
  reporter.onTestEnd(current, { status: 'failed', error: primary });
  await reporter.onEnd({ status: 'failed' });
  const value = JSON.parse(await readFile(process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH, 'utf8'));
  assert.equal(value.code, 'EMPTY_AFTER_DEADLINE');
  assert.deepEqual(value.phaseTimings, [
    { phase: 'admissions-first', count: 1, totalMs: 30, maxMs: 30 },
    { phase: 'drain', count: 2, totalMs: 15010, maxMs: 15000 },
  ]);
  for (const bad of [
    [{ phase: 'secret-canary', count: 1, totalMs: 1, maxMs: 1 }],
    [{ ...value.phaseTimings[0], token: 'secret-canary' }],
    [{ ...value.phaseTimings[0], totalMs: -1 }],
    [{ ...value.phaseTimings[0], maxMs: 600001 }],
    [{ ...value.phaseTimings[0], count: 10001 }],
    [value.phaseTimings[0], value.phaseTimings[0]],
  ]) assert.equal(validateAuthenticatedHostedPlaywrightDiagnostic({ ...value, phaseTimings: bad }), null);
  assert.equal(JSON.stringify(value).includes('secret-canary'), false);
});

test('actor transition attribution uses only the canonical failure and fixed entry stage', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'authenticated-actor-reporter-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const prior = process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
  t.after(() => {
    if (prior === undefined) delete process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
    else process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH = prior;
  });
  for (const [stage, operation, code] of [
    ['initial', 'ACTOR_ENTRY_INITIAL', 'NOT_QUIESCENT'],
    ['canonical', 'ACTOR_ENTRY_CANONICAL', 'EMPTY_AFTER_DEADLINE'],
    ['cached', 'ACTOR_ENTRY_CACHED', 'STABILITY_AFTER_DEADLINE'],
  ]) {
    const destination = path.join(root, `${stage}.json`);
    process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH = destination;
    const reporter = new AuthenticatedHostedPlaywrightReporter();
    const current = fixture([...titles.keys()][0]);
    const primary = { message: `Error: AUTHENTICATED_BROWSER_ACTOR_TRANSITION_${code}`,
      location: { file: path.resolve('tests/browser/authenticatedHostedNetwork.ts'), line: 1 } };
    const caught = { message: 'fixture-sensitive-caught' };
    const caughtStep = { title: 'hosted:actor:entry-cached', error: caught };
    const primaryStep = { title: `hosted:actor:entry-${stage}`, error: primary };
    reporter.onTestBegin(current);
    reporter.onStepBegin(current, {}, caughtStep);
    reporter.onStepEnd(current, {}, caughtStep);
    reporter.onStepBegin(current, {}, primaryStep);
    reporter.onStepEnd(current, {}, primaryStep);
    reporter.onTestEnd(current, { status: 'failed', error: primary });
    await reporter.onEnd({ status: 'failed' });
    const serialized = await readFile(destination, 'utf8');
    const value = JSON.parse(serialized);
    assert.deepEqual(value, { schemaVersion: 'authenticated-hosted-playwright-diagnostic-v1',
      project: 'desktop-chromium', testCategory: 'primary-lifecycle', category: 'unexpected-failure',
      operation, phase: 'ACTOR_TRANSITION', code,
      location: { source: 'tests/browser/authenticatedHostedNetwork.ts', line: 1 } });
    assert.equal(serialized.includes('fixture-sensitive'), false);
    assert.equal(serialized.includes('hosted:actor:'), false);
    assert.equal(validateAuthenticatedHostedPlaywrightDiagnostic({ ...value, operation: 'RAW_ACTOR' }), null);
    assert.equal(validateAuthenticatedHostedPlaywrightDiagnostic({ ...value, actorId: 'private' }), null);
  }
});

test('static reporter maps every hosted test title without retaining raw errors', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'authenticated-reporter-test-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const prior=process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
  t.after(()=>{if(prior===undefined)delete process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
    else process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=prior;});
  for(const [title,category] of titles){
    const destination=path.join(root,`${category}.json`);
    process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=destination;
    const reporter=new AuthenticatedHostedPlaywrightReporter();const current=fixture(title);
    reporter.onTestBegin(current);reporter.onTestEnd(current,{status:'failed'});
    await reporter.onEnd({status:'failed'});
    const value=JSON.parse(await readFile(destination,'utf8'));
    assert.deepEqual(value,{schemaVersion:'authenticated-hosted-playwright-diagnostic-v1',project:'desktop-chromium',
      testCategory:category,category:'unexpected-failure'});
    assert.equal(JSON.stringify(value).includes('fixture-sensitive-value'),false);
  }
});

test('static reporter uses the first canonical errors entry when result.error is absent', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'authenticated-reporter-errors-fallback-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const prior=process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
  t.after(()=>{if(prior===undefined)delete process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
    else process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=prior;});
  const destination=path.join(root,'errors-fallback.json');
  process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=destination;
  const reporter=new AuthenticatedHostedPlaywrightReporter();const current=fixture([...titles.keys()][0]);
  reporter.onTestBegin(current);
  reporter.onTestEnd(current,{status:'failed',errors:[new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_RESPONSE_REJECTED'),
    new Error('fixture-sensitive-later')]});
  await reporter.onEnd({status:'failed'});
  const value=JSON.parse(await readFile(destination,'utf8'));
  assert.equal(value.phase,'CONTROL_CHANNEL');assert.equal(value.code,'RESPONSE_REJECTED');
  assert.equal(JSON.stringify(value).includes('fixture-sensitive'),false);
});

test('static reporter gives hook failures bootstrap or teardown precedence', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'authenticated-reporter-hook-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const prior=process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
  t.after(()=>{if(prior===undefined)delete process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
    else process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=prior;});
  for(const [hook,category] of [['beforeAll hook','project-bootstrap'],['afterAll hook','project-teardown']]){
    const destination=path.join(root,`${category}.json`);
    process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=destination;
    const reporter=new AuthenticatedHostedPlaywrightReporter();const current=fixture([...titles.keys()][0]);
    const hookError=new Error('fixture-sensitive-value');
    reporter.onTestBegin(current);reporter.onStepEnd(current,{}, {category:'hook',title:hook,error:hookError});
    reporter.onTestEnd(current,{status:'failed',error:hookError});await reporter.onEnd({status:'failed'});
    const value=JSON.parse(await readFile(destination,'utf8'));
    assert.equal(value.testCategory,category);assert.equal(JSON.stringify(value).includes('fixture-sensitive-value'),false);
  }
});

test('static reporter retains the canonical primary source and line without raw failure fields', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'authenticated-reporter-location-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const prior=process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
  t.after(()=>{if(prior===undefined)delete process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
    else process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=prior;});
  const destination=path.join(root,'location.json');
  process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=destination;
  const reporter=new AuthenticatedHostedPlaywrightReporter();const current=fixture([...titles.keys()][0]);
  reporter.onTestBegin(current);
  reporter.onStepEnd(current,{}, {category:'expect',title:'caught',error:new Error('fixture-sensitive-caught'),
    location:{file:path.resolve('tests/browser/authenticatedLifecycleHarness.ts'),line:2,column:88}});
  const primary=Object.assign(new Error('fixture-sensitive-primary'),{location:{
    file:path.resolve('tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts'),line:1,column:77}});
  reporter.onTestEnd(current,{status:'failed',error:primary,errors:[primary]});await reporter.onEnd({status:'failed'});
  const value=JSON.parse(await readFile(destination,'utf8'));
  assert.deepEqual(value.location,{source:'tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts',line:1});
  assert.equal(JSON.stringify(value).includes('fixture-sensitive'),false);
  assert.equal(Object.hasOwn(value.location,'column'),false);
});

test('an invalid canonical location cannot be replaced by a later errors entry', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'authenticated-reporter-first-location-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const prior=process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
  t.after(()=>{if(prior===undefined)delete process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
    else process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=prior;});
  const destination=path.join(root,'first-location.json');
  process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=destination;
  const reporter=new AuthenticatedHostedPlaywrightReporter();const current=fixture([...titles.keys()][0]);
  reporter.onTestBegin(current);
  const primary=Object.assign(new Error('first'),{location:{file:path.resolve('outside-sensitive.ts'),line:1,column:1}});
  const later=Object.assign(new Error('later'),{location:{
    file:path.resolve('tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts'),line:1,column:1}});
  reporter.onTestEnd(current,{status:'failed',error:primary,errors:[primary,later]});await reporter.onEnd({status:'failed'});
  const value=JSON.parse(await readFile(destination,'utf8'));
  assert.equal(Object.hasOwn(value,'location'),false);
});

test('a test-end failure without step detail cannot inherit a later teardown location', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'authenticated-reporter-test-end-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const prior=process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
  t.after(()=>{if(prior===undefined)delete process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
    else process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=prior;});
  const destination=path.join(root,'test-end.json');
  process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=destination;
  const reporter=new AuthenticatedHostedPlaywrightReporter();const current=fixture([...titles.keys()][0]);
  reporter.onTestBegin(current);reporter.onTestEnd(current,{status:'failed'});
  reporter.onStepEnd(current,{}, {category:'hook',title:'afterAll hook',error:new Error('later'),
    location:{file:path.resolve('tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts'),line:1,column:1}});
  await reporter.onEnd({status:'failed'});
  const value=JSON.parse(await readFile(destination,'utf8'));
  assert.equal(Object.hasOwn(value,'location'),false);
  assert.equal(value.testCategory,'primary-lifecycle');
});

test('the first bounded failure descriptor survives later teardown noise', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'authenticated-reporter-primary-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const prior=process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
  t.after(()=>{if(prior===undefined)delete process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
    else process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=prior;});
  const destination=path.join(root,'primary.json');
  process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=destination;
  const reporter=new AuthenticatedHostedPlaywrightReporter();const current=fixture([...titles.keys()][0]);
  reporter.onTestBegin(current);
  const primary=Object.assign(new Error('AUTHENTICATED_BROWSER_ACTION_START_REJECTED'),{location:{
    file:path.resolve('tests/browser/authenticatedHostedNetwork.ts'),line:1,column:1}});
  reporter.onStepEnd(current,{}, {category:'expect',title:'caught',error:new Error('fixture-sensitive-caught')});
  reporter.onTestEnd(current,{status:'failed',error:primary,errors:[primary]});
  reporter.onStepEnd(current,{}, {category:'hook',title:'afterAll hook',
    error:new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_REJECTED'),
    location:{file:path.resolve('tests/browser/authenticatedLifecycleHarness.ts'),line:1,column:1}});
  reporter.onTestEnd(current,{status:'failed',error:new Error('fixture-sensitive-final')});
  await reporter.onEnd({status:'failed'});
  const value=JSON.parse(await readFile(destination,'utf8'));
  assert.equal(value.testCategory,'primary-lifecycle');
  assert.equal(value.phase,'NETWORK_TRACKER');assert.equal(value.code,'ACTION_START_REJECTED');
  assert.deepEqual(value.location,{source:'tests/browser/authenticatedHostedNetwork.ts',line:1});
  assert.equal(JSON.stringify(value).includes('fixture-sensitive'),false);
});

test('process reload classifications survive reporter serialization without raw assertion details', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'authenticated-reporter-process-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const prior=process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
  t.after(()=>{if(prior===undefined)delete process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
    else process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=prior;});
  for (const code of ['AUTHORITY_READ_REJECTED','PROCESS_DETAIL_MISSING','PROCESS_DETAIL_HIDDEN','PROCESS_DETAIL_AMBIGUOUS']) {
    const destination=path.join(root,`${code}.json`);
    process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=destination;
    const reporter=new AuthenticatedHostedPlaywrightReporter();
    const current=fixture([...titles.keys()][0]);
    reporter.onTestBegin(current);
    const primary=new Error(`ENTERPRISE_LIFECYCLE_BROWSER_${code}`);
    reporter.onTestEnd(current,{status:'failed',error:primary,errors:[primary]});
    reporter.onTestEnd(current,{status:'failed',error:new Error('private-process-label-and-response')});
    await reporter.onEnd({status:'failed'});
    const value=JSON.parse(await readFile(destination,'utf8'));
    assert.deepEqual(validateAuthenticatedHostedPlaywrightDiagnostic(value),value);
    assert.equal(value.phase,'PROCESS_RELOAD');
    assert.equal(value.code,code);
    assert.equal(JSON.stringify(value).includes('private-process'),false);
  }
});

test('an unknown first failure cannot be replaced by a later allowlisted descriptor', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'authenticated-reporter-unknown-primary-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const prior=process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
  t.after(()=>{if(prior===undefined)delete process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
    else process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=prior;});
  const destination=path.join(root,'unknown-primary.json');
  process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=destination;
  const reporter=new AuthenticatedHostedPlaywrightReporter();const current=fixture([...titles.keys()][0]);
  reporter.onTestBegin(current);
  reporter.onTestEnd(current,{status:'failed',error:new Error('raw-sensitive-first')});
  reporter.onStepEnd(current,{}, {category:'hook',title:'afterAll hook',
    error:new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_SESSION_REJECTED')});
  reporter.onTestEnd(current,{status:'failed',error:new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_SESSION_REJECTED')});
  await reporter.onEnd({status:'failed'});
  const value=JSON.parse(await readFile(destination,'utf8'));
  assert.equal(Object.hasOwn(value,'phase'),false);assert.equal(Object.hasOwn(value,'code'),false);
  assert.equal(value.testCategory,'primary-lifecycle');assert.equal(JSON.stringify(value).includes('raw-sensitive'),false);
});

test('a timed out test retains only the deepest fixed active operation and allowlisted source location', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'authenticated-reporter-active-operation-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const prior=process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
  t.after(()=>{if(prior===undefined)delete process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
    else process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=prior;});
  const destination=path.join(root,'active-operation.json');
  process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=destination;
  const reporter=new AuthenticatedHostedPlaywrightReporter();const current=fixture([...titles.keys()][0]);
  const outer={title:'hosted:safety:server',location:{
    file:path.resolve('tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts'),line:1,column:44}};
  const inner={title:'hosted:control:permit-arm',location:{
    file:path.resolve('tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts'),line:2,column:55},
  error:new Error('fixture-sensitive-timeout')};
  reporter.onTestBegin(current);
  reporter.onStepBegin(current,{status:'running'},outer);
  reporter.onStepBegin(current,{status:'running'},inner);
  reporter.onStepEnd(current,{status:'timedOut'},inner);
  reporter.onStepEnd(current,{status:'timedOut'},outer);
  reporter.onTestEnd(current,{status:'timedOut',error:new Error('fixture-sensitive-timeout')});
  await reporter.onEnd({status:'failed'});
  const value=JSON.parse(await readFile(destination,'utf8'));
  assert.equal(value.category,'timeout');
  assert.equal(value.operation,'PERMIT_ARM');
  assert.deepEqual(value.location,{source:'tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts',line:2});
  assert.equal(JSON.stringify(value).includes('fixture-sensitive'),false);
  assert.equal(JSON.stringify(value).includes('hosted:'),false);
});

test('a primary timeout inside V1 completion retains the source-owned milestone', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'authenticated-reporter-v1-completion-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const prior=process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
  t.after(()=>{if(prior===undefined)delete process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
    else process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=prior;});
  const destination=path.join(root,'v1-completion.json');
  process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=destination;
  const reporter=new AuthenticatedHostedPlaywrightReporter();const current=fixture([...titles.keys()][0]);
  const milestone={title:'hosted:primary:v1-assessment-completion',location:{
    file:path.resolve('tests/browser/enterpriseLifecycleAcceptance/v1AssessmentCompletion.ts'),line:1,column:1}};
  reporter.onTestBegin(current);reporter.onStepBegin(current,{status:'running'},milestone);
  reporter.onTestEnd(current,{status:'timedOut',error:new Error('fixture-sensitive-timeout')});
  await reporter.onEnd({status:'failed'});
  const value=JSON.parse(await readFile(destination,'utf8'));
  assert.equal(value.operation,'V1_ASSESSMENT_COMPLETION');
  assert.deepEqual(value.location,{source:'tests/browser/enterpriseLifecycleAcceptance/v1AssessmentCompletion.ts',line:1});
  assert.equal(JSON.stringify(value).includes('fixture-sensitive'),false);
});

test('a completed later-primary step retains its exact primary timeout before onTestEnd marks the test timed out', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'authenticated-reporter-completed-primary-timeout-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const prior=process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
  t.after(()=>{if(prior===undefined)delete process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
    else process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=prior;});
  const destination=path.join(root,'completed-primary-timeout.json');
  process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=destination;
  const reporter=new AuthenticatedHostedPlaywrightReporter();const current=fixture([...titles.keys()][0]);
  const primary=new Error('fixture-sensitive-primary-timeout');
  const step={title:'hosted:primary:v2-finalization-and-review',error:primary,location:{
    file:path.resolve('tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts'),line:1187}};
  reporter.onTestBegin(current);
  reporter.onStepBegin(current,{status:'running'},step);
  reporter.onStepEnd(current,{status:'running'},step);
  reporter.onTestEnd(current,{status:'timedOut',error:primary,errors:[primary]});
  await reporter.onEnd({status:'failed'});
  const value=JSON.parse(await readFile(destination,'utf8'));
  assert.equal(value.category,'timeout');
  assert.equal(value.operation,'PRIMARY_V2_FINALIZATION_AND_REVIEW');
  assert.deepEqual(value.location,{source:'tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts',line:1187});
  assert.equal(JSON.stringify(value).includes('fixture-sensitive'),false);
});

test('a cloned generic timeout shared by completed operations remains unattributed', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'authenticated-reporter-generic-timeout-ambiguous-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const prior=process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
  t.after(()=>{if(prior===undefined)delete process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
    else process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=prior;});
  const destination=path.join(root,'generic-timeout-ambiguous.json');
  process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=destination;
  const reporter=new AuthenticatedHostedPlaywrightReporter();const current=fixture([...titles.keys()][0]);
  const location={file:path.resolve('tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts'),line:1187};
  const timeout=()=>Object.assign(new Error('fixture-sensitive-primary-timeout'),{location});
  reporter.onTestBegin(current);
  for(const title of ['hosted:primary:v2-finalization-and-review','hosted:queue:teardown']){
    const step={title,error:timeout(),location};
    reporter.onStepBegin(current,{status:'running'},step);
    reporter.onStepEnd(current,{status:'running'},step);
  }
  reporter.onTestEnd(current,{status:'timedOut',error:timeout(),errors:[timeout()]});
  await reporter.onEnd({status:'failed'});
  const value=JSON.parse(await readFile(destination,'utf8'));
  assert.equal(value.category,'timeout');
  assert.equal(Object.hasOwn(value,'operation'),false);
  assert.deepEqual(value.location,{source:'tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts',line:1187});
  assert.equal(JSON.stringify(value).includes('fixture-sensitive'),false);
});

test('a caught earlier generic error cannot claim a later primary timeout', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'authenticated-reporter-generic-timeout-caught-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const prior=process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
  t.after(()=>{if(prior===undefined)delete process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
    else process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=prior;});
  const destination=path.join(root,'generic-timeout-caught.json');
  process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=destination;
  const reporter=new AuthenticatedHostedPlaywrightReporter();const current=fixture([...titles.keys()][0]);
  const earlier=Object.assign(new Error('caught-earlier'),{location:{
    file:path.resolve('tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts'),line:1187}});
  const step={title:'hosted:primary:v2-finalization-and-review',error:earlier,location:earlier.location};
  const primary=Object.assign(new Error('primary-timeout'),{location:{
    file:path.resolve('tests/browser/authenticatedLifecycleHarness.ts'),line:2}});
  reporter.onTestBegin(current);
  reporter.onStepBegin(current,{status:'running'},step);
  reporter.onStepEnd(current,{status:'running'},step);
  reporter.onTestEnd(current,{status:'timedOut',error:primary,errors:[primary]});
  await reporter.onEnd({status:'failed'});
  const value=JSON.parse(await readFile(destination,'utf8'));
  assert.equal(value.category,'timeout');
  assert.equal(Object.hasOwn(value,'operation'),false);
  assert.deepEqual(value.location,{source:'tests/browser/authenticatedLifecycleHarness.ts',line:2});
  assert.equal(JSON.stringify(value).includes('caught-earlier'),false);
  assert.equal(JSON.stringify(value).includes('primary-timeout'),false);
});

test('completed and unknown steps cannot supply a timeout operation', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'authenticated-reporter-completed-operation-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const prior=process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
  t.after(()=>{if(prior===undefined)delete process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
    else process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=prior;});
  const destination=path.join(root,'completed-operation.json');
  process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=destination;
  const reporter=new AuthenticatedHostedPlaywrightReporter();const current=fixture([...titles.keys()][0]);
  const completed={title:'hosted:control:observe',location:{
    file:path.resolve('tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts'),line:1}};
  reporter.onTestBegin(current);
  reporter.onStepBegin(current,{status:'running'},completed);
  reporter.onStepEnd(current,{status:'passed'},completed);
  reporter.onStepBegin(current,{status:'running'},{title:'fixture-sensitive-arbitrary-step'});
  reporter.onTestEnd(current,{status:'timedOut',error:new Error('fixture-sensitive-timeout')});
  await reporter.onEnd({status:'failed'});
  const value=JSON.parse(await readFile(destination,'utf8'));
  assert.equal(value.category,'timeout');
  assert.equal(Object.hasOwn(value,'operation'),false);
  assert.equal(Object.hasOwn(value,'location'),false);
  assert.equal(JSON.stringify(value).includes('fixture-sensitive'),false);
});

test('a canonical assertion descriptor and location take precedence over an active operation', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'authenticated-reporter-assertion-precedence-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const prior=process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
  t.after(()=>{if(prior===undefined)delete process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
    else process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=prior;});
  const destination=path.join(root,'assertion-precedence.json');
  process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=destination;
  const reporter=new AuthenticatedHostedPlaywrightReporter();const current=fixture([...titles.keys()][0]);
  const active={title:'hosted:control:observe',location:{
    file:path.resolve('tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts'),line:2}};
  const primary=Object.assign(new Error('AUTHENTICATED_BROWSER_ACTION_START_REJECTED'),{location:{
    file:path.resolve('tests/browser/authenticatedHostedNetwork.ts'),line:1,column:77}});
  reporter.onTestBegin(current);
  reporter.onStepBegin(current,{status:'running'},active);
  reporter.onTestEnd(current,{status:'timedOut',error:primary,errors:[primary]});
  reporter.onStepEnd(current,{status:'timedOut'},{category:'hook',title:'afterAll hook',
    error:new Error('fixture-sensitive-later')});
  await reporter.onEnd({status:'failed'});
  const value=JSON.parse(await readFile(destination,'utf8'));
  assert.equal(value.phase,'NETWORK_TRACKER');
  assert.equal(value.code,'ACTION_START_REJECTED');
  assert.deepEqual(value.location,{source:'tests/browser/authenticatedHostedNetwork.ts',line:1});
  assert.equal(Object.hasOwn(value,'operation'),false);
  assert.equal(JSON.stringify(value).includes('fixture-sensitive'),false);
});

test('an unrelated earlier control timeout step cannot claim the primary timeout operation', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'authenticated-reporter-timeout-correlation-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const prior=process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
  t.after(()=>{if(prior===undefined)delete process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
    else process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=prior;});
  const destination=path.join(root,'timeout-correlation.json');
  process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=destination;
  const reporter=new AuthenticatedHostedPlaywrightReporter();const current=fixture([...titles.keys()][0]);
  const earlierError=Object.assign(new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_TIMEOUT'),{location:{
    file:path.resolve('tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts'),line:1}});
  const earlier={title:'hosted:control:observe',error:earlierError,location:{
    file:path.resolve('tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts'),line:1}};
  const primary=Object.assign(new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_TIMEOUT'),{location:{
    file:path.resolve('tests/browser/authenticatedLifecycleHarness.ts'),line:2}});
  reporter.onTestBegin(current);
  reporter.onStepBegin(current,{status:'running'},earlier);
  reporter.onStepEnd(current,{status:'running'},earlier);
  reporter.onTestEnd(current,{status:'failed',error:primary,errors:[primary]});
  await reporter.onEnd({status:'failed'});
  const value=JSON.parse(await readFile(destination,'utf8'));
  assert.equal(value.phase,'CONTROL_CHANNEL');
  assert.equal(value.code,'CONTROL_REQUEST_TIMEOUT');
  assert.deepEqual(value.location,{source:'tests/browser/authenticatedLifecycleHarness.ts',line:2});
  assert.equal(Object.hasOwn(value,'operation'),false);
  assert.equal(JSON.stringify(value).includes('hosted:'),false);
});

test('indistinguishable cloned control timeout errors omit ambiguous operation attribution', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'authenticated-reporter-timeout-ambiguous-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const prior=process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
  t.after(()=>{if(prior===undefined)delete process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
    else process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=prior;});
  const destination=path.join(root,'timeout-ambiguous.json');
  process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=destination;
  const reporter=new AuthenticatedHostedPlaywrightReporter();const current=fixture([...titles.keys()][0]);
  const location={file:path.resolve('tests/browser/authenticatedLifecycleHarness.ts'),line:2};
  const timeoutError=()=>Object.assign(new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_TIMEOUT'),{location});
  const earlier={title:'hosted:control:action-start',error:timeoutError(),location};
  const primaryStep={title:'hosted:control:permit-arm',error:timeoutError(),location};
  const primary=timeoutError();
  reporter.onTestBegin(current);
  reporter.onStepBegin(current,{status:'running'},earlier);
  reporter.onStepEnd(current,{status:'running'},earlier);
  reporter.onStepBegin(current,{status:'running'},primaryStep);
  reporter.onStepEnd(current,{status:'failed'},primaryStep);
  reporter.onTestEnd(current,{status:'failed',error:primary,errors:[primary]});
  await reporter.onEnd({status:'failed'});
  const value=JSON.parse(await readFile(destination,'utf8'));
  assert.equal(value.phase,'CONTROL_CHANNEL');
  assert.equal(value.code,'CONTROL_REQUEST_TIMEOUT');
  assert.deepEqual(value.location,{source:'tests/browser/authenticatedLifecycleHarness.ts',line:2});
  assert.equal(Object.hasOwn(value,'operation'),false);
});

test('nested known steps sharing the exact primary timeout retain the innermost operation', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'authenticated-reporter-timeout-nested-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const prior=process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
  t.after(()=>{if(prior===undefined)delete process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
    else process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=prior;});
  const destination=path.join(root,'timeout-nested.json');
  process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=destination;
  const reporter=new AuthenticatedHostedPlaywrightReporter();const current=fixture([...titles.keys()][0]);
  const location={file:path.resolve('tests/browser/authenticatedLifecycleHarness.ts'),line:2};
  const primary=Object.assign(new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_TIMEOUT'),{location});
  const outer={title:'hosted:safety:server',error:primary,location};
  const inner={title:'hosted:control:permit-arm',error:primary,location};
  reporter.onTestBegin(current);
  reporter.onStepBegin(current,{status:'running'},outer);
  reporter.onStepBegin(current,{status:'running'},inner);
  reporter.onStepEnd(current,{status:'failed'},inner);
  reporter.onStepEnd(current,{status:'failed'},outer);
  reporter.onTestEnd(current,{status:'failed',error:primary,errors:[primary]});
  await reporter.onEnd({status:'failed'});
  const value=JSON.parse(await readFile(destination,'utf8'));
  assert.equal(value.phase,'CONTROL_CHANNEL');
  assert.equal(value.code,'CONTROL_REQUEST_TIMEOUT');
  assert.equal(value.operation,'PERMIT_ARM');
  assert.deepEqual(value.location,{source:'tests/browser/authenticatedLifecycleHarness.ts',line:2});
});

test('a real Playwright failure crosses the reporter boundary as a closed descriptor', async t => {
  const root=await mkdtemp(path.join(process.cwd(),'authenticated-reporter-integration-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const destination=path.join(root,'diagnostic.json');
  const reporterPath=path.resolve('scripts/authenticatedHostedPlaywrightReporter.mjs');
  const testDir=JSON.stringify(root.replaceAll('\\','/'));
  const config=path.join(root,'playwright.config.mjs');
  await writeFile(path.join(root,'failure.spec.mjs'),`import { test } from '@playwright/test';\n`+
    `test('bounded failure', async () => { throw new Error('AUTHENTICATED_BROWSER_ACTION_START_REJECTED'); });\n`);
  await writeFile(config,`export default { testDir: ${testDir}, projects: [{ name: 'desktop-chromium' }], `+
    `reporter: [[${JSON.stringify(reporterPath)}]] };\n`);
  let exitCode=0;
  try {
    await execFileAsync(process.execPath,[path.resolve('node_modules/@playwright/test/cli.js'),'test','--config',config],{
      cwd:process.cwd(),env:{...process.env,AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH:destination},maxBuffer:2_000_000,
    });
  } catch (error) { exitCode=error?.code; }
  assert.equal(exitCode,1);
  let serialized;
  try { serialized=await readFile(destination,'utf8'); }
  catch { assert.fail('real Playwright diagnostic missing'); }
  const value=JSON.parse(serialized);
  assert.deepEqual(validateAuthenticatedHostedPlaywrightDiagnostic(value),value);
  assert.equal(value.phase,'NETWORK_TRACKER');assert.equal(value.code,'ACTION_START_REJECTED');
  assert.equal(JSON.stringify(value).includes('bounded failure'),false);
});

test('real Playwright serializes actor phase timings with its primary timeout', async t => {
  const root = await mkdtemp(path.join(process.cwd(), 'authenticated-phase-integration-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const destination = path.join(root, 'diagnostic.json'), config = path.join(root, 'playwright.config.mjs');
  await writeFile(path.join(root, 'phase.spec.mjs'), `import { test } from '@playwright/test';
test('local phase transport', async () => {
  await test.step('hosted:actor-boundary', async () => {
    await test.step('hosted:actor-phase:admissions-first', async () => {});
    await test.step('hosted:actor-phase:drain', async () => {
      await new Promise(resolve => setTimeout(resolve, 30));
    });
    throw new Error('AUTHENTICATED_BROWSER_ACTOR_TRANSITION_EMPTY_AFTER_DEADLINE');
  });
});
`);
  await writeFile(config, `export default { testDir: ${JSON.stringify(root.replaceAll('\\', '/'))},
    projects: [{ name: 'desktop-chromium' }],
    reporter: [[${JSON.stringify(path.resolve('scripts/authenticatedHostedPlaywrightReporter.mjs'))}]] };`);
  let exitCode = 0;
  try {
    await execFileAsync(process.execPath, [path.resolve('node_modules/@playwright/test/cli.js'), 'test', '--config', config], {
      cwd: process.cwd(), env: { ...process.env, AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH: destination },
      maxBuffer: 2_000_000, timeout: 30_000,
    });
  } catch (error) { exitCode = error?.code; }
  assert.equal(exitCode, 1);
  const value = JSON.parse(await readFile(destination, 'utf8'));
  assert.equal(value.code, 'EMPTY_AFTER_DEADLINE');
  assert.deepEqual(value.phaseTimings.map(item => item.phase), ['admissions-first', 'drain']);
  assert.ok(value.phaseTimings.find(item => item.phase === 'drain').totalMs >= 20);
  assert.deepEqual(validateAuthenticatedHostedPlaywrightDiagnostic(value), value);
});

for (const [stepTitle, expectedOperation] of [
  ['hosted:control:observe', 'OBSERVE'],
  ['hosted:primary:journey', 'PRIMARY_JOURNEY'],
]) test(`a real Playwright timeout retains ${expectedOperation} without raw step text`, async t => {
  const root=await mkdtemp(path.join(process.cwd(),'authenticated-reporter-timeout-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const destination=path.join(root,'diagnostic.json');
  const reporterPath=path.resolve('scripts/authenticatedHostedPlaywrightReporter.mjs');
  const testDir=JSON.stringify(root.replaceAll('\\','/'));
  const config=path.join(root,'playwright.config.mjs');
  await writeFile(path.join(root,'timeout.spec.mjs'),`import { test } from '@playwright/test';\n`+
    `test('authors, replays, rejects stale work, requests changes and resubmits through the production UI', async () => {\n`+
    `  await test.step(${JSON.stringify(stepTitle)}, async () => {\n`+
    `    await new Promise(() => {});\n`+
    `  });\n`+
    `});\n`);
  await writeFile(config,`export default { testDir: ${testDir}, timeout: 150, projects: [{ name: 'desktop-chromium' }], `+
    `reporter: [[${JSON.stringify(reporterPath)}]] };\n`);
  let exitCode=0;
  try {
    await execFileAsync(process.execPath,[path.resolve('node_modules/@playwright/test/cli.js'),'test','--config',config],{
      cwd:process.cwd(),env:{...process.env,AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH:destination},maxBuffer:2_000_000,
      timeout:10_000,
    });
  } catch (error) { exitCode=error?.code; }
  assert.equal(exitCode,1);
  const serialized=await readFile(destination,'utf8');
  const value=JSON.parse(serialized);
  assert.deepEqual(validateAuthenticatedHostedPlaywrightDiagnostic(value),value);
  assert.equal(value.category,'timeout');
  assert.equal(value.operation,expectedOperation);
  assert.equal(Object.hasOwn(value,'location'),false);
  assert.equal(serialized.includes(stepTitle),false);
  assert.equal(serialized.includes('authors, replays'),false);
});

for (const mode of ['unique', 'ambiguous', 'unrelated', 'outside']) {
  test(`ordinary Govern failure attribution is bounded: ${mode}`, async t => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'authenticated-ordinary-correlation-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const prior = process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
    t.after(() => { if (prior === undefined) delete process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
      else process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH = prior; });
    const destination = path.join(root, 'diagnostic.json');
    process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH = destination;
    const reporter = new AuthenticatedHostedPlaywrightReporter();
    const current = fixture([...titles.keys()][1]);
    const location = { file: path.resolve('tests/browser/enterpriseLifecycleAcceptance/governReviewerDenial.ts'), line: 70 };
    const error = message => Object.assign(new Error(message), { location });
    const primary = error('private-synthetic-ordinary-failure');
    reporter.onTestBegin(current);
    for (const title of mode === 'outside' ? [] : mode === 'ambiguous'
      ? ['hosted:govern-studio:reviewer-denial', 'hosted:govern-studio:approver-resolution']
      : ['hosted:govern-studio:reviewer-denial']) {
      const step = { title, location, error: error(mode === 'unrelated' ? 'private-caught-error' : primary.message) };
      reporter.onStepBegin(current, { status: 'running' }, step);
      reporter.onStepEnd(current, { status: 'failed' }, step);
    }
    reporter.onTestEnd(current, { status: 'failed', error: primary, errors: [primary] });
    await reporter.onEnd({ status: 'failed' });
    const serialized = await readFile(destination, 'utf8');
    const value = JSON.parse(serialized);
    assert.equal(value.operation, mode === 'unique' ? 'GOVERN_STUDIO_REVIEWER_DENIAL' : undefined);
    assert.deepEqual(value.location, { source: 'tests/browser/enterpriseLifecycleAcceptance/governReviewerDenial.ts', line: 70 });
    assert.equal(serialized.includes('private-'), false);
    assert.equal(serialized.includes('hosted:'), false);
  });
}

test('a real ordinary Govern Studio assertion retains its fixed operation without private text', async t => {
  const root = await mkdtemp(path.join(process.cwd(), 'authenticated-reporter-ordinary-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const destination = path.join(root, 'diagnostic.json');
  const config = path.join(root, 'playwright.config.mjs');
  await writeFile(path.join(root, 'ordinary.spec.mjs'), `import { test, expect } from '@playwright/test';
test('independent approval, Govern separation and synthetic Studio generation retain exact lineage', async () => {
  await test.step('hosted:govern-studio:studio-request', async () => {
    expect('private-synthetic-value').toBe('private-other-value');
  });
});`);
  await writeFile(config, `export default { testDir: ${JSON.stringify(root.replaceAll('\\', '/'))},
    projects: [{ name: 'desktop-chromium' }],
    reporter: [[${JSON.stringify(path.resolve('scripts/authenticatedHostedPlaywrightReporter.mjs'))}]] };`);
  let exitCode = 0;
  try {
    await execFileAsync(process.execPath, [path.resolve('node_modules/@playwright/test/cli.js'), 'test', '--config', config], {
      cwd: process.cwd(), env: { ...process.env, AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH: destination },
      maxBuffer: 2_000_000, timeout: 15000,
    });
  } catch (error) { exitCode = error?.code; }
  assert.equal(exitCode, 1);
  const serialized = await readFile(destination, 'utf8');
  const value = JSON.parse(serialized);
  assert.deepEqual(validateAuthenticatedHostedPlaywrightDiagnostic(value), value);
  assert.equal(value.category, 'unexpected-failure');
  assert.equal(value.operation, 'GOVERN_STUDIO_STUDIO_REQUEST');
  for (const forbidden of ['private-synthetic', 'private-other', 'hosted:govern-studio', 'ordinary.spec']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('a real Playwright control timeout failure retains its correlated fixed operation', async t => {
  const root=await mkdtemp(path.join(process.cwd(),'authenticated-reporter-control-timeout-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const destination=path.join(root,'diagnostic.json');
  const reporterPath=path.resolve('scripts/authenticatedHostedPlaywrightReporter.mjs');
  const testDir=JSON.stringify(root.replaceAll('\\','/'));
  const config=path.join(root,'playwright.config.mjs');
  await writeFile(path.join(root,'control-timeout.spec.mjs'),`import { test } from '@playwright/test';\n`+
    `test('authors, replays, rejects stale work, requests changes and resubmits through the production UI', async () => {\n`+
    `  await test.step('hosted:control:permit-arm', async () => {\n`+
    `    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_TIMEOUT');\n`+
    `  });\n`+
    `});\n`);
  await writeFile(config,`export default { testDir: ${testDir}, projects: [{ name: 'desktop-chromium' }], `+
    `reporter: [[${JSON.stringify(reporterPath)}]] };\n`);
  let exitCode=0;
  try {
    await execFileAsync(process.execPath,[path.resolve('node_modules/@playwright/test/cli.js'),'test','--config',config],{
      cwd:process.cwd(),env:{...process.env,AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH:destination},maxBuffer:2_000_000,
      timeout:10_000,
    });
  } catch (error) { exitCode=error?.code; }
  assert.equal(exitCode,1);
  const serialized=await readFile(destination,'utf8');
  const value=JSON.parse(serialized);
  assert.deepEqual(validateAuthenticatedHostedPlaywrightDiagnostic(value),value);
  assert.equal(value.category,'unexpected-failure');
  assert.equal(value.phase,'CONTROL_CHANNEL');
  assert.equal(value.code,'CONTROL_REQUEST_TIMEOUT');
  assert.equal(value.operation,'PERMIT_ARM');
  assert.equal(serialized.includes('hosted:control:permit-arm'),false);
  assert.equal(serialized.includes('authors, replays'),false);
});

test('a real Playwright caught step cannot replace the canonical primary failure or its location', async t => {
  const root=await mkdtemp(path.join(process.cwd(),'authenticated-reporter-canonical-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const destination=path.join(root,'diagnostic.json');
  const reporterPath=path.resolve('scripts/authenticatedHostedPlaywrightReporter.mjs');
  const readinessPath=path.resolve('tests/browser/productNavigationReadiness.ts').replaceAll('\\','/');
  const testDir=JSON.stringify(root.replaceAll('\\','/'));
  const config=path.join(root,'playwright.config.mjs');
  await writeFile(path.join(root,'failure.spec.mjs'),`import { test } from '@playwright/test';\n`+
    `import { resolveProductNavigationShell } from ${JSON.stringify(readinessPath)};\n`+
    `test.afterAll(async () => { throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_ACTION_REJECTED'); });\n`+
    `test('authors, replays, rejects stale work, requests changes and resubmits through the production UI', async () => {\n`+
    `  try { await test.step('caught control failure', async () => {\n`+
    `    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_REJECTED');\n`+
    `  }); } catch {}\n`+
    `  await resolveProductNavigationShell({\n`+
    `    isVisible: async () => false, waitForAnyVisible: async () => { throw new Error('fixture-private'); },\n`+
    `    clickOpener: async () => {}, requireVisible: async () => {},\n`+
    `  }, 1);\n`+
    `});\n`);
  await writeFile(config,`export default { testDir: ${testDir}, projects: [{ name: 'desktop-chromium' }], `+
    `reporter: [[${JSON.stringify(reporterPath)}]] };\n`);
  let exitCode=0;
  try {
    await execFileAsync(process.execPath,[path.resolve('node_modules/@playwright/test/cli.js'),'test','--config',config],{
      cwd:process.cwd(),env:{...process.env,AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH:destination},maxBuffer:2_000_000,
    });
  } catch (error) { exitCode=error?.code; }
  assert.equal(exitCode,1);
  const value=JSON.parse(await readFile(destination,'utf8'));
  assert.equal(value.testCategory,'primary-lifecycle');
  assert.equal(value.phase,'PRODUCT_NAVIGATION');
  assert.equal(value.code,'SHELL_NOT_READY');
  assert.equal(value.location?.source,'tests/browser/productNavigationReadiness.ts');
  assert.equal(Number.isSafeInteger(value.location?.line),true);
  assert.equal(JSON.stringify(value).includes('fixture-private'),false);
  assert.equal(JSON.stringify(value).includes('CONTROL_REJECTED'),false);
});

test('a real Playwright case upload rejection fails its owning test without finalization or an unhandled rejection', async t => {
  const root=await mkdtemp(path.join(process.cwd(),'authenticated-case-queue-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const destination=path.join(root,'diagnostic.json');
  const statePath=path.join(root,'state.json');
  const reporterPath=path.resolve('scripts/authenticatedHostedPlaywrightReporter.mjs');
  const harnessPath=path.resolve('tests/browser/authenticatedLifecycleHarness.ts').replaceAll('\\','/');
  const testDir=JSON.stringify(root.replaceAll('\\','/'));
  const config=path.join(root,'playwright.config.mjs');
  await writeFile(path.join(root,'failure.spec.mjs'),`import { writeFile } from 'node:fs/promises';\n`+
    `import { test } from '@playwright/test';\n`+
    `import { createAuthenticatedLifecycleWorkQueue } from ${JSON.stringify(harnessPath)};\n`+
    `const caseUploadQueue=createAuthenticatedLifecycleWorkQueue();\n`+
    `let unhandled=0; const onUnhandled=()=>{unhandled+=1}; process.on('unhandledRejection',onUnhandled);\n`+
    `test.afterEach(async () => { await caseUploadQueue.drain(); });\n`+
    `test.afterAll(async () => {\n`+
    `  let boundaryFailure=null; try { await caseUploadQueue.drain(); } catch (error) { boundaryFailure=error; }\n`+
    `  await new Promise(resolve=>setImmediate(resolve)); process.off('unhandledRejection',onUnhandled);\n`+
    `  const finalized=!boundaryFailure; await writeFile(${JSON.stringify(statePath.replaceAll('\\','/'))},JSON.stringify({finalized,unhandled}));\n`+
    `  if(boundaryFailure)throw boundaryFailure;\n`+
    `});\n`+
    `test('authors, replays, rejects stale work, requests changes and resubmits through the production UI', async () => {\n`+
    `  caseUploadQueue.enqueue(async()=>{throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_ACTION_REJECTED')});\n`+
    `  await new Promise(resolve=>setImmediate(resolve));\n`+
    `});\n`);
  await writeFile(config,`export default { testDir: ${testDir}, projects: [{ name: 'desktop-chromium' }], `+
    `reporter: [[${JSON.stringify(reporterPath)}]] };\n`);
  let exitCode=0;
  try {
    await execFileAsync(process.execPath,[path.resolve('node_modules/@playwright/test/cli.js'),'test','--config',config],{
      cwd:process.cwd(),env:{...process.env,AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH:destination},maxBuffer:2_000_000,
    });
  } catch (error) { exitCode=error?.code; }
  assert.equal(exitCode,1);
  assert.deepEqual(JSON.parse(await readFile(statePath,'utf8')),{finalized:false,unhandled:0});
  const value=JSON.parse(await readFile(destination,'utf8'));
  assert.equal(value.testCategory,'primary-lifecycle');
  assert.equal(value.phase,'CONTROL_CHANNEL');
  assert.equal(value.code,'ACTION_REJECTED');
  assert.equal(Object.hasOwn(value,'location'),false);
  assert.equal(JSON.stringify(value).includes('unhandledRejection'),false);
});

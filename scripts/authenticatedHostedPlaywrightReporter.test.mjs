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
    reporter.onTestBegin(current);reporter.onStepEnd(current,{}, {category:'hook',title:hook,error:new Error('fixture-sensitive-value')});
    reporter.onTestEnd(current,{status:'failed'});await reporter.onEnd({status:'failed'});
    const value=JSON.parse(await readFile(destination,'utf8'));
    assert.equal(value.testCategory,category);assert.equal(JSON.stringify(value).includes('fixture-sensitive-value'),false);
  }
});

test('static reporter retains the first safe step source and line without raw failure fields', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'authenticated-reporter-location-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const prior=process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
  t.after(()=>{if(prior===undefined)delete process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
    else process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=prior;});
  const destination=path.join(root,'location.json');
  process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=destination;
  const reporter=new AuthenticatedHostedPlaywrightReporter();const current=fixture([...titles.keys()][0]);
  reporter.onTestBegin(current);
  reporter.onStepEnd(current,{}, {category:'expect',title:'fixture-sensitive-title',error:new Error('fixture-sensitive-message'),
    location:{file:path.resolve('tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts'),line:1,column:77}});
  reporter.onStepEnd(current,{}, {category:'expect',title:'later',error:new Error('later'),
    location:{file:path.resolve('tests/browser/authenticatedLifecycleHarness.ts'),line:2,column:88}});
  reporter.onTestEnd(current,{status:'failed'});await reporter.onEnd({status:'failed'});
  const value=JSON.parse(await readFile(destination,'utf8'));
  assert.deepEqual(value.location,{source:'tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts',line:1});
  assert.equal(JSON.stringify(value).includes('fixture-sensitive'),false);
  assert.equal(Object.hasOwn(value.location,'column'),false);
});

test('an invalid first failure location cannot be replaced by a later valid hook location', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'authenticated-reporter-first-location-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const prior=process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
  t.after(()=>{if(prior===undefined)delete process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH;
    else process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=prior;});
  const destination=path.join(root,'first-location.json');
  process.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH=destination;
  const reporter=new AuthenticatedHostedPlaywrightReporter();const current=fixture([...titles.keys()][0]);
  reporter.onTestBegin(current);
  reporter.onStepEnd(current,{}, {category:'expect',title:'first',error:new Error('first'),
    location:{file:path.resolve('outside-sensitive.ts'),line:1,column:1}});
  reporter.onStepEnd(current,{}, {category:'hook',title:'afterAll hook',error:new Error('later'),
    location:{file:path.resolve('tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts'),line:1,column:1}});
  reporter.onTestEnd(current,{status:'failed'});await reporter.onEnd({status:'failed'});
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
  reporter.onStepEnd(current,{}, {category:'expect',title:'first',
    error:new Error('AUTHENTICATED_BROWSER_ACTION_START_REJECTED'),
    location:{file:path.resolve('tests/browser/authenticatedHostedNetwork.ts'),line:1,column:1}});
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
  reporter.onStepEnd(current,{}, {category:'expect',title:'first',error:new Error('raw-sensitive-first')});
  reporter.onStepEnd(current,{}, {category:'hook',title:'afterAll hook',
    error:new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_SESSION_REJECTED')});
  reporter.onTestEnd(current,{status:'failed'});await reporter.onEnd({status:'failed'});
  const value=JSON.parse(await readFile(destination,'utf8'));
  assert.equal(Object.hasOwn(value,'phase'),false);assert.equal(Object.hasOwn(value,'code'),false);
  assert.equal(value.testCategory,'primary-lifecycle');assert.equal(JSON.stringify(value).includes('raw-sensitive'),false);
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

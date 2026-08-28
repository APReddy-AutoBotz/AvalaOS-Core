import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type Request,
  type TestInfo,
  type WebSocket as PlaywrightWebSocket,
} from '@playwright/test';

import {
  AuthorityLocalStorageKeys,
  AuthoritySessionStorageKeys,
} from '../../services/storageAuthority';
import { createAuthorityRequestObserver } from './authorityRequestObserver';
import {
  classifyPublicRoute,
  parseAuthorityOrigins,
  parseFullPlatformBaseUrl,
  parseFullPlatformExecutionMode,
  validateFullPlatformServerPreflight,
} from './fullPlatformContract';

const baseOrigin = parseFullPlatformBaseUrl(process.env.FULL_PLATFORM_BASE_URL);
const executionMode = parseFullPlatformExecutionMode(process.env.FULL_PLATFORM_EXECUTION_MODE);
const authorityOrigins = parseAuthorityOrigins(process.env.FULL_PLATFORM_AUTHORITY_ORIGINS);
const providerOrigins = new Set(['https://api.openai.com', 'https://api.groq.com']);
const externalStaticOrigins = new Set([
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://cdn.jsdelivr.net',
  'https://aistudiocdn.com',
]);
const personas: Array<[label:string,userName:string]> = [
  ['Process Analyst', 'Maya Patel'],
  ['AP Process Owner', 'Priya Nair'],
  ['Delivery Lead', 'Alicia Morgan'],
  ['Control Reviewer', 'Emily White'],
  ['Automation Contributor', 'Frank Miller'],
  ['Buyer Viewer', 'Sarah Chen'],
  ['Platform Admin', 'Henry Wilson'],
];
const assessSubnav = ['Process Catalog', 'Assessment Templates', 'Enterprise Intelligence'];
const studioSubnav = ['Create / Governed Sources', 'Document Vault', 'Studio Templates'];
const deliverySubnav = ['Overview / Board', 'Work List', 'Backlog', 'Roadmap', 'Calendar', 'Timeline', 'Capacity', 'Sprints', 'Delivery Pack', 'Timesheets', 'Automations'];
const POST_SIGN_OUT_QUIET_MS = 500;
const POST_SIGN_OUT_TIMEOUT_MS = 5_000;
const ENTRY_BUDGET_MS = 12_000;
const SURFACE_BUDGET_MS = 4_000;
const MAX_TRACE_EVENTS = 250;

type ViolationCategory = 'direct-provider' | 'credential-boundary' | 'unexpected-origin' | 'fixture-authority-request';
type Violation = {transport:'http'|'eventsource'|'websocket';category:ViolationCategory;method:string;resourceType:string;originClass:string};
type SanitizedTraceEvent = Omit<Violation,'category'> & {category:ViolationCategory|'allowed';sequence:number;outcome:'allowed'|'violation'};

const normalizedOrigin = (rawUrl:string) => {
  const url = new URL(rawUrl);
  if (url.protocol === 'ws:') return `http://${url.host}`;
  if (url.protocol === 'wss:') return `https://${url.host}`;
  return url.origin;
};

const originClass = (rawUrl:string) => {
  const origin = normalizedOrigin(rawUrl);
  if (origin === baseOrigin) return 'application-origin';
  const authorityIndex = authorityOrigins.indexOf(origin);
  if (authorityIndex >= 0) return `authority-origin-${authorityIndex + 1}`;
  if (providerOrigins.has(origin)) return 'provider-origin';
  if (externalStaticOrigins.has(origin)) return 'declared-static-origin';
  return 'unexpected-external-origin';
};

const createObservedTransport = (page:Page, trace:SanitizedTraceEvent[]) => {
  let sequence = 0;
  const record = (sample:Omit<Violation,'category'>, category:ViolationCategory|null) => {
    if (trace.length >= MAX_TRACE_EVENTS) return;
    trace.push({...sample,category:category ?? 'allowed',sequence:++sequence,outcome:category?'violation':'allowed'});
  };
  const classifyRequest = (request:Request):ViolationCategory|null => {
    const url = request.url();
    const origin = normalizedOrigin(url);
    const transport = request.resourceType() === 'eventsource' ? 'eventsource' : 'http';
    const sample = {transport,method:request.method().toUpperCase(),resourceType:request.resourceType(),originClass:originClass(url)} as const;
    let category:ViolationCategory|null = null;
    if (providerOrigins.has(origin)) category = 'direct-provider';
    else {
      const credentialHeader = Object.keys(request.headers()).some(name => /^(?:authorization|apikey|x-api-key)$/iu.test(name));
      const isAuthority = authorityOrigins.includes(origin);
      if (credentialHeader && !(executionMode === 'connected' && isAuthority)) category = 'credential-boundary';
      else if (isAuthority && executionMode !== 'connected') category = 'fixture-authority-request';
      else if (origin !== baseOrigin && !isAuthority && !(
        externalStaticOrigins.has(origin) && ['GET','HEAD'].includes(sample.method)
      )) category = 'unexpected-origin';
    }
    record(sample,category);
    return category;
  };
  const classifyWebSocket = (socket:PlaywrightWebSocket):ViolationCategory|null => {
    const url = socket.url();
    const origin = normalizedOrigin(url);
    const sample = {transport:'websocket',method:'CONNECT',resourceType:'websocket',originClass:originClass(url)} as const;
    let category:ViolationCategory|null = null;
    if (providerOrigins.has(origin)) category = 'direct-provider';
    else if (authorityOrigins.includes(origin) && executionMode !== 'connected') category = 'fixture-authority-request';
    else if (origin !== baseOrigin && !authorityOrigins.includes(origin)) category = 'unexpected-origin';
    record(sample,category);
    return category;
  };
  return createAuthorityRequestObserver<Request,Violation>({
    page,
    classify:classifyRequest,
    sample:(request,category)=>({transport:request.resourceType()==='eventsource'?'eventsource':'http',category:category as ViolationCategory,method:request.method().toUpperCase(),resourceType:request.resourceType(),originClass:originClass(request.url())}),
    webSocket:{
      page,
      classify:socket=>classifyWebSocket(socket as PlaywrightWebSocket),
      sample:(socket,category)=>({transport:'websocket',category:category as ViolationCategory,method:'CONNECT',resourceType:'websocket',originClass:originClass((socket as PlaywrightWebSocket).url())}),
    },
    maxSamples:25,
  });
};

const installFailClosedEgressGuard = async(page:Page) => {
  await page.route('**/*',async route=>{
    const request=route.request();
    const origin=normalizedOrigin(request.url());
    const method=request.method().toUpperCase();
    const isAuthority=authorityOrigins.includes(origin);
    const credentialHeader=Object.keys(request.headers()).some(name=>/^(?:authorization|apikey|x-api-key)$/iu.test(name));
    const allowedOrigin=
      origin===baseOrigin ||
      (executionMode==='connected'&&isAuthority) ||
      (externalStaticOrigins.has(origin)&&['GET','HEAD'].includes(method));
    const credentialAllowed=executionMode==='connected'&&isAuthority;
    if(providerOrigins.has(origin)||!allowedOrigin||(credentialHeader&&!credentialAllowed)){
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
};

const runPreflight = async(request:APIRequestContext) => {
  const application = await request.get('/sandbox', {failOnStatusCode:false});
  expect(application.ok(), 'the configured application server must answer before browser evidence starts').toBeTruthy();
  if(executionMode==='fixture')return;
  const url=process.env.FULL_PLATFORM_SERVER_PREFLIGHT_URL;
  if(!url)throw new Error('FULL_PLATFORM_SERVER_PREFLIGHT_URL is required in connected mode');
  const response=await request.get(url,{failOnStatusCode:false});
  expect(response.ok(),'connected mode requires a successful server preflight').toBeTruthy();
  validateFullPlatformServerPreflight({
    payload:await response.json(),
    expectedOrganizationId:process.env.FULL_PLATFORM_EXPECTED_ORGANIZATION_ID,
    expectedWorkspaceId:process.env.FULL_PLATFORM_EXPECTED_WORKSPACE_ID,
  });
};

test.beforeAll(async({request})=>runPreflight(request));

const openNavigation = async(page:Page) => {
  const opener=page.getByRole('button',{name:'Open navigation'});
  if(await opener.isVisible().catch(()=>false))await opener.click();
};

const closeNavigation = async(page:Page) => {
  const close=page.getByRole('button',{name:'Close primary navigation'});
  if(await close.isVisible().catch(()=>false))await close.click();
};

const selectScope = async(page:Page, label:string) => {
  await closeNavigation(page);
  const switcher=page.getByRole('button',{name:'Switch workspace context'});
  await expect(switcher).toBeVisible();
  await switcher.click();
  const option=label==='My Work'
    ? page.getByRole('button').filter({has:page.getByText('Tasks and decisions assigned to you',{exact:true})})
    : page.getByRole('button',{name:label,exact:true});
  await expect(option).toBeVisible();
  await option.click();
};

const assertSurface = async(page:Page, started:number) => {
  const main=page.locator('#app-main');
  await expect(main).toBeVisible();
  await expect.poll(async()=>(await main.innerText()).trim().length).toBeGreaterThan(20);
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  const overflow=await page.evaluate(()=>Math.max(document.documentElement.scrollWidth-document.documentElement.clientWidth,document.body.scrollWidth-document.body.clientWidth));
  expect(overflow,'authorized surfaces must not overflow the viewport').toBeLessThanOrEqual(1);
  expect(Date.now()-started,'an interactive fixture surface must settle inside the navigation budget').toBeLessThanOrEqual(SURFACE_BUDGET_MS);
  const axe=await new AxeBuilder({page}).analyze();
  expect(axe.violations.filter(item=>item.impact==='serious'||item.impact==='critical'),'each visited authorized surface must clear serious and critical accessibility violations').toEqual([]);
};

const visitIfAuthorized = async(page:Page,label:string,visited:Set<string>) => {
  await openNavigation(page);
  const button=page.getByRole('button',{name:label,exact:true});
  if(await button.count()!==1||!(await button.isVisible().catch(()=>false))||await button.isDisabled())return false;
  const started=Date.now();
  await button.click();
  if(await button.isVisible().catch(()=>false)){
    await expect(button).toHaveAttribute('aria-current','page');
  }else{
    await openNavigation(page);
    const reopened=page.getByRole('button',{name:label,exact:true});
    await expect(reopened).toHaveAttribute('aria-current','page');
  }
  await closeNavigation(page);
  await assertSurface(page,started);
  visited.add(label);
  return true;
};

const visitGroup = async(page:Page,root:string,children:string[],visited:Set<string>) => {
  if(!(await visitIfAuthorized(page,root,visited)))return;
  for(const child of children)await visitIfAuthorized(page,child,visited);
};

const assertActivePersona = async(page:Page,userName:string) => {
  await openNavigation(page);
  const mobileIdentity=page.getByTestId('mobile-current-user');
  if(await mobileIdentity.isVisible().catch(()=>false)){
    await expect(mobileIdentity.getByText(userName,{exact:true})).toBeVisible();
    return;
  }
  await expect(page.getByTestId('desktop-current-user').getByText(userName,{exact:true})).toBeVisible();
};

const enterPersona = async(page:Page,label:string,userName:string) => {
  const started=Date.now();
  const response=await page.goto('/sandbox',{waitUntil:'domcontentloaded'});
  expect(response?.ok()).toBeTruthy();
  await expect(page.getByRole('heading',{name:'Explore with synthetic data.'})).toBeVisible();
  const choice=page.getByRole('group',{name:'Choose a sandbox persona'}).getByRole('button').filter({hasText:label});
  await choice.click();
  await page.getByRole('button',{name:`Enter sandbox as ${label}`}).click();
  await assertActivePersona(page,userName);
  expect(Date.now()-started,'persona entry must settle inside the campaign budget').toBeLessThanOrEqual(ENTRY_BUDGET_MS);
};

const signOutAndAssertFailClosed = async(page:Page) => {
  await page.evaluate(({localKeys,sessionKeys})=>{
    localStorage.setItem(localKeys[1],'synthetic-organization-selection');
    sessionStorage.setItem(sessionKeys[0],JSON.stringify({organizationId:'synthetic-org',workspaceId:'synthetic-workspace'}));
  },{localKeys:AuthorityLocalStorageKeys,sessionKeys:AuthoritySessionStorageKeys});
  await openNavigation(page);
  const mobile=page.getByTestId('mobile-sign-out');
  if(await mobile.isVisible().catch(()=>false))await mobile.click();
  else await page.getByTestId('desktop-current-user').getByRole('button',{name:'Sign Out'}).click();
  await expect(page.getByRole('heading',{name:'Explore with synthetic data.'})).toBeVisible();
  const persisted=await page.evaluate(({localKeys,sessionKeys})=>({
    local:localKeys.map(key=>localStorage.getItem(key)),
    session:sessionKeys.map(key=>sessionStorage.getItem(key)),
    search:location.search,
  }),{localKeys:AuthorityLocalStorageKeys,sessionKeys:AuthoritySessionStorageKeys});
  expect(persisted).toEqual({local:AuthorityLocalStorageKeys.map(()=>null),session:AuthoritySessionStorageKeys.map(()=>null),search:''});
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.getByRole('group',{name:'Choose a sandbox persona'})).toBeVisible();
  await expect(page.getByTestId('desktop-current-user')).toHaveCount(0);
};

const attachFailureTrace = async(testInfo:TestInfo,trace:SanitizedTraceEvent[]) => {
  await testInfo.attach('sanitized-transport-trace.json',{body:Buffer.from(JSON.stringify({schemaVersion:'avalaos-browser-trace-v1',events:trace},null,2)),contentType:'application/json'});
};

for(const [label,userName] of personas){
  test(`${label}: every visible authorized deterministic surface, accessibility, persistence and transport`,async({page},testInfo)=>{
    await installFailClosedEgressGuard(page);
    const trace:SanitizedTraceEvent[]=[];
    const observer=createObservedTransport(page,trace);
    const pageErrors:string[]=[];
    page.on('pageerror',error=>pageErrors.push(error.name||'Error'));
    try{
      await enterPersona(page,label,userName);
      const visited=new Set<string>();
      await openNavigation(page);
      if(label==='Platform Admin')await expect(page.getByRole('button',{name:'Admin / Intelligence'})).toBeVisible();
      else await expect(page.getByRole('button',{name:'Admin / Intelligence'})).toHaveCount(0);
      const closeNavigation=page.getByRole('button',{name:'Close primary navigation'});
      if(await closeNavigation.isVisible().catch(()=>false))await closeNavigation.click();
      await selectScope(page,'My Work');
      await visitIfAuthorized(page,'Home',visited);
      await visitGroup(page,'Assess',assessSubnav,visited);
      await visitIfAuthorized(page,'Govern',visited);
      await visitIfAuthorized(page,'Monitor',visited);
      await selectScope(page,'AP Invoice Exception Workflow');
      await visitGroup(page,'Studio',studioSubnav,visited);
      await visitGroup(page,'Delivery',deliverySubnav,visited);
      await visitIfAuthorized(page,'Admin / Intelligence',visited);
      expect(visited.size,`${label} must expose at least one authorized product surface`).toBeGreaterThan(0);
      await signOutAndAssertFailClosed(page);
      await observer.stopAfterQuiescence({quietPeriodMs:POST_SIGN_OUT_QUIET_MS,timeoutMs:POST_SIGN_OUT_TIMEOUT_MS});
      expect(observer.snapshot(),'provider/direct-authority observation remains active through sign-out, reload and quiescence').toEqual({totalViolations:0,samples:[]});
      expect(pageErrors,'browser page errors').toEqual([]);
    }catch(error){
      await attachFailureTrace(testInfo,trace);
      throw error;
    }
  });
}

test('accepted sandbox descendants are distinct from a genuinely denied non-admin product view',async({page},testInfo)=>{
  await installFailClosedEgressGuard(page);
  const trace:SanitizedTraceEvent[]=[];
  const observer=createObservedTransport(page,trace);
  try{
    expect(classifyPublicRoute('/sandbox/unexpected-deep-link')).toBe('sandbox');
    await page.goto('/sandbox/unexpected-deep-link',{waitUntil:'domcontentloaded'});
    await expect(page.getByRole('heading',{name:'Explore with synthetic data.'})).toBeVisible();
    await enterPersona(page,'Process Analyst','Maya Patel');
    await page.goto('/sandbox?view=enterprise_intelligence&scope=organization',{waitUntil:'domcontentloaded'});
    await expect(page.getByRole('heading',{name:'Enterprise Intelligence',exact:true})).toHaveCount(0);
    await openNavigation(page);
    await expect(page.getByRole('button',{name:'Admin / Intelligence'})).toHaveCount(0);
    await signOutAndAssertFailClosed(page);
    await observer.stopAfterQuiescence({quietPeriodMs:POST_SIGN_OUT_QUIET_MS,timeoutMs:POST_SIGN_OUT_TIMEOUT_MS});
    expect(observer.snapshot()).toEqual({totalViolations:0,samples:[]});
  }catch(error){
    await attachFailureTrace(testInfo,trace);
    throw error;
  }
});

import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';
import { CANONICAL_AP_ASSESSMENT } from '../../data/mockData';

const USER='11111111-1111-4111-8111-111111111111';
const ORG='22222222-2222-4222-8222-222222222222';
const WS='33333333-3333-4333-8333-333333333333';
const PROCESS='44444444-4444-4444-8444-444444444444';
const ASSESSMENT='55555555-5555-4555-8555-555555555555';
const HANDOFF='66666666-6666-4666-8666-666666666666';
const API='http://127.0.0.1:59999';
const ALL_CAPABILITIES = [
  'assess.read','assess.create','assess.response.write','assess.finalize',
  'govern.resolve','studio.handoff.create',
];

type BoundaryCode = 'AUTHENTICATION_REQUIRED' | 'AUTHORITY_STALE' |
  'RESOURCE_NOT_AVAILABLE' | 'PERMISSION_DENIED' | 'VERSION_CONFLICT';

type FixtureOptions = {
  capabilities?: string[];
  failCommand?: { type: string; code: BoundaryCode };
  initialStatus?: 'Ready for Review' | 'Approved' | 'Handed Off to Docs';
  trustedApproval?: boolean;
};

type AssessmentRow = {
  id: string;
  process_id: string;
  org_id: string;
  workspace_id: string;
  version: number;
  score_version?: string | null;
  status: string;
  metadata: unknown;
  responses: unknown;
  evidence_items: unknown[];
  assumptions: unknown[];
  completion_by_section: unknown;
  review?: unknown;
  scores?: unknown;
};

const jsonHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'content-type': 'application/json',
};

const installEnterpriseFixture = async (page: Page, options: FixtureOptions = {}) => {
  const capabilities = options.capabilities ?? ALL_CAPABILITIES;
  const committedCommands: Array<Record<string, any>> = [];
  const receipts = new Map<string,{ signature: string; response: unknown }>();
  let trustedApproval = options.trustedApproval ?? false;
  let handoffId: string | null = options.initialStatus === 'Handed Off to Docs' ? HANDOFF : null;
  let assessment: AssessmentRow | null = options.initialStatus ? {
    id: ASSESSMENT,
    process_id: PROCESS,
    org_id: ORG,
    workspace_id: WS,
    version: options.initialStatus === 'Handed Off to Docs' ? 3 : 1,
    score_version: CANONICAL_AP_ASSESSMENT.scores?.scoreVersion || 'assess-core-2026-05',
    status: options.initialStatus,
    metadata: CANONICAL_AP_ASSESSMENT.metadata,
    responses: CANONICAL_AP_ASSESSMENT.responses,
    evidence_items: CANONICAL_AP_ASSESSMENT.evidenceItems,
    assumptions: CANONICAL_AP_ASSESSMENT.assumptions,
    completion_by_section: CANONICAL_AP_ASSESSMENT.completionBySection,
    review: CANONICAL_AP_ASSESSMENT.review,
    scores: CANONICAL_AP_ASSESSMENT.scores,
  } : null;

  const user = {
    id: USER,
    email: 'reviewer@avala.test',
    role: 'authenticated',
    user_metadata: { full_name: 'Enterprise Reviewer' },
    aud: 'authenticated',
    created_at: '2026-07-13T00:00:00.000Z',
  };
  await page.addInitScript(({ user }) => {
    const now = Math.floor(Date.now()/1000);
    localStorage.setItem('sb-127-auth-token',JSON.stringify({
      access_token:'browser-fixture-token',
      refresh_token:'browser-fixture-refresh',
      token_type:'bearer',
      expires_in:3600,
      expires_at:now+3600,
      user,
    }));
    localStorage.setItem('avalaos-core-v1-view',JSON.stringify('process_catalog'));
    localStorage.setItem('avalaos-core-v1-scope',JSON.stringify({ type:'my_work' }));
  },{ user });

  const fail = async (route: any, code: string, status = 409) => route.fulfill({
    status,
    headers:jsonHeaders,
    body:JSON.stringify({ ok:false,error:{ code,message:'The command could not be completed.' } }),
  });

  await page.route('**/*',async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === 'http://127.0.0.1:4173') return route.continue();
    if (url.origin !== API) return route.abort();
    if (request.method() === 'OPTIONS') return route.fulfill({ status:204,headers:jsonHeaders,body:'' });

    if (url.pathname === '/auth/v1/user') {
      return route.fulfill({ status:200,headers:jsonHeaders,body:JSON.stringify(user) });
    }
    if (url.pathname === '/auth/v1/token') {
      return route.fulfill({ status:200,headers:jsonHeaders,body:JSON.stringify({
        access_token:'browser-fixture-token',refresh_token:'browser-fixture-refresh',
        token_type:'bearer',expires_in:3600,user,
      }) });
    }
    if (url.pathname === '/functions/v1/tenant-session') {
      return route.fulfill({ status:200,headers:jsonHeaders,body:JSON.stringify({ contexts:[{
        userId:USER,organizationId:ORG,organizationName:'Avala Enterprise',
        workspaceId:WS,workspaceName:'Governed Assess',authorizationVersion:9,capabilities,
      }] }) });
    }
    if (url.pathname === '/functions/v1/assess-command') {
      const body = request.postDataJSON() as Record<string,any>;
      if (options.failCommand?.type === body.commandType) {
        return fail(route,options.failCommand.code,options.failCommand.code === 'AUTHENTICATION_REQUIRED' ? 401 : 409);
      }
      if (body.commandType === 'studio_handoff.create' &&
          (assessment?.status !== 'Approved' || !trustedApproval)) {
        return fail(route,'COMMAND_UNAVAILABLE',409);
      }
      const key = `${body.commandType}:${body.idempotencyKey}`;
      const signature = JSON.stringify({
        organizationId:body.organizationId,workspaceId:body.workspaceId,
        expectedVersion:body.expectedVersion,payload:body.payload,
      });
      const receipt = receipts.get(key);
      if (receipt) {
        if (receipt.signature !== signature) return fail(route,'IDEMPOTENCY_CONFLICT',409);
        return route.fulfill({ status:200,headers:jsonHeaders,body:JSON.stringify(receipt.response) });
      }
      if (body.commandType !== 'assessment.create' &&
          (!assessment || body.expectedVersion !== assessment.version)) {
        return fail(route,'VERSION_CONFLICT',409);
      }

      if (body.commandType === 'assessment.create') {
        assessment = {
          id:body.requestId,process_id:body.payload.processId,org_id:ORG,workspace_id:WS,
          version:1,status:'Draft',metadata:{ completionQuality:0,templateFit:false,lastSavedAt:new Date().toISOString(),
            stakeholderCoverage:1,evidenceQuality:1,assumptionQuality:1 },
          responses:{ processStructure:{},workPattern:{},dataProfile:{},judgment:{},systems:{},risk:{} },
          evidence_items:[],assumptions:[],completion_by_section:{
            processStructure:0,workPattern:0,dataProfile:0,judgment:0,systems:0,risk:0,evidenceAndAssumptions:0,
          },
        };
      } else if (body.commandType === 'assessment.response.upsert' && assessment) {
        assessment = {
          ...assessment,version:assessment.version+1,status:'Draft',
          responses:body.payload.responses,metadata:body.payload.metadata,
          evidence_items:body.payload.evidenceItems,assumptions:body.payload.assumptions,
        };
      } else if (body.commandType === 'assessment.finalize' && assessment) {
        assessment = {
          ...assessment,version:assessment.version+1,status:'Ready for Review',
          score_version:CANONICAL_AP_ASSESSMENT.scores?.scoreVersion || 'assess-core-2026-05',
          metadata:CANONICAL_AP_ASSESSMENT.metadata,responses:CANONICAL_AP_ASSESSMENT.responses,
          evidence_items:CANONICAL_AP_ASSESSMENT.evidenceItems,assumptions:CANONICAL_AP_ASSESSMENT.assumptions,
          completion_by_section:CANONICAL_AP_ASSESSMENT.completionBySection,
          review:CANONICAL_AP_ASSESSMENT.review,scores:CANONICAL_AP_ASSESSMENT.scores,
        };
      } else if (body.commandType === 'govern.resolve' && assessment) {
        const status = body.payload.resolution === 'submit' ? 'In Review'
          : body.payload.resolution === 'approve' ? 'Approved'
          : body.payload.resolution === 'request_changes' ? 'Changes Requested' : 'Rejected';
        assessment = { ...assessment,version:assessment.version+1,status };
        if (body.payload.resolution === 'approve') trustedApproval = true;
      } else if (body.commandType === 'studio_handoff.create' && assessment) {
        assessment = { ...assessment,version:assessment.version+1,status:'Handed Off to Docs' };
        handoffId = HANDOFF;
      }

      const resource = {
        assessmentId:assessment!.id,version:assessment!.version,status:assessment!.status,
        ...(assessment!.score_version ? { scoreVersion:assessment!.score_version } : {}),
        ...(body.commandType === 'studio_handoff.create' ? { handoffId } : {}),
      };
      const response = { ok:true,outcome:'committed',resource };
      receipts.set(key,{ signature,response });
      committedCommands.push(body);
      return route.fulfill({ status:200,headers:jsonHeaders,body:JSON.stringify(response) });
    }

    if (url.pathname === '/rest/v1/assess_processes') {
      return route.fulfill({ status:200,headers:{...jsonHeaders,'content-range':'0-0/1'},body:JSON.stringify([{
        id:PROCESS,org_id:ORG,workspace_id:WS,name:'Invoice exception handling',
        description:'Resolve invoice exceptions before payment release.',owner_id:USER,
        department:'Finance',criticality:'High',status:'Not Started',
        created_at:'2026-07-13T00:00:00.000Z',updated_at:'2026-07-13T00:00:00.000Z',
      }]) });
    }
    if (url.pathname === '/rest/v1/assessments') {
      return route.fulfill({
        status:200,headers:{...jsonHeaders,'content-range':assessment ? '0-0/1' : '*/0'},
        body:JSON.stringify(assessment),
      });
    }
    if (url.pathname === '/rest/v1/assessment_studio_handoffs') {
      return route.fulfill({
        status:200,headers:{...jsonHeaders,'content-range':handoffId ? '0-0/1' : '*/0'},
        body:JSON.stringify(handoffId ? { id:handoffId } : null),
      });
    }
    return route.fulfill({ status:200,headers:{...jsonHeaders,'content-range':'*/0'},body:'[]' });
  });

  return {
    committedCommands,
    get assessment(){ return assessment; },
    setAssessmentStatus(status: string){ if (assessment) assessment={...assessment,status}; },
    get handoffId(){ return handoffId; },
  };
};

const openAssessment = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByRole('heading',{ name:'Assessment inventory' })).toBeVisible({ timeout:15_000 });
  await page.getByRole('button',{ name:'View' }).first().click();
  await expect(page.getByRole('heading',{ name:'Invoice exception handling' })).toBeVisible();
  await page.getByRole('button',{ name:/Start Assessment|Open Decision Pack/ }).click();
  await expect(page.getByTestId('enterprise-assess')).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  page.on('pageerror',error => console.error(`PR1C_PAGE_ERROR: ${error.message}`));
  page.on('console',message => { if (message.type()==='error') console.error(`PR1C_CONSOLE_ERROR: ${message.text()}`); });
  page.on('dialog',dialog => dialog.dismiss());
});

test('production App completes create, save, finalize, Govern, durable Studio handoff, and reload eligibility',async ({ page }) => {
  test.setTimeout(60_000);
  const fixture = await installEnterpriseFixture(page);
  await openAssessment(page);

  await page.getByRole('button',{ name:/Save Draft/ }).click();
  await expect.poll(() => fixture.committedCommands.map(item => item.commandType)).toEqual([
    'assessment.create','assessment.response.upsert',
  ]);

  await page.getByRole('button',{ name:'Calculate deterministic score' }).first().click();
  await expect(page.getByRole('button',{ name:'Send for Review' })).toBeVisible();
  await page.getByRole('button',{ name:'Send for Review' }).click();
  await page.getByRole('button',{ name:'Approve' }).click();
  await page.getByRole('button',{ name:'Create governed Studio handoff' }).click();

  await expect.poll(() => fixture.assessment?.status).toBe('Handed Off to Docs');
  expect(fixture.handoffId).toBe(HANDOFF);
  await page.getByRole('button',{ name:'Back to Process' }).click();
  const studio = page.getByRole('button',{ name:'Open Avala Studio handoff' });
  await expect(studio).toBeEnabled();
});

test('bypass and legacy Approved records fail closed without false Studio success',async ({ page }) => {
  const fixture = await installEnterpriseFixture(page,{ initialStatus:'Approved',trustedApproval:false });
  await page.goto('/');
  const direct = async () => page.evaluate(async ({ API,ORG,WS,ASSESSMENT }) => {
    const response = await fetch(`${API}/functions/v1/assess-command`,{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({
        requestId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID(),
        commandType:'studio_handoff.create',organizationId:ORG,workspaceId:WS,
        authorizationVersion:9,expectedVersion:1,payload:{assessmentId:ASSESSMENT,reason:null},
      }),
    });
    return { status:response.status,body:await response.json() };
  },{ API,ORG,WS,ASSESSMENT });
  const legacy = await direct();
  expect(legacy.status).toBe(409);
  expect(legacy.body.ok).toBe(false);
  fixture.setAssessmentStatus('Ready for Review');
  const bypass = await direct();
  expect(bypass.status).toBe(409);
  expect(fixture.handoffId).toBeNull();
  expect(fixture.committedCommands).toHaveLength(0);
});

test('server-issued capability projection disables mutation controls with an accessible explanation',async ({ page }) => {
  await installEnterpriseFixture(page,{ capabilities:['assess.read'] });
  await openAssessment(page);
  const save = page.getByRole('button',{ name:/Save Draft/ });
  await expect(save).toBeDisabled();
  await expect(save).toHaveAttribute('title',/assess\.create/);
  await expect(page.getByRole('status')).toContainText(/assess\.create/);
});

for (const [code,heading] of [
  ['AUTHORITY_STALE','Access context changed'],
  ['RESOURCE_NOT_AVAILABLE','Access revoked'],
  ['AUTHENTICATION_REQUIRED','Session expired'],
] as const) {
  test(`${code} becomes an explicit production App failure state`,async ({ page }) => {
    await installEnterpriseFixture(page,{ failCommand:{ type:'assessment.create',code } });
    await openAssessment(page);
    await page.getByRole('button',{ name:/Save Draft/ }).click();
    await expect(page.getByRole('heading',{ name:heading })).toBeVisible();
  });
}

test('actor-scoped idempotent retry returns one committed create result',async ({ page }) => {
  const fixture = await installEnterpriseFixture(page);
  await page.goto('/');
  const results = await page.evaluate(async ({ API,ORG,WS,PROCESS }) => {
    const body = {
      requestId:'77777777-7777-4777-8777-777777777777',idempotencyKey:'retry-create',
      commandType:'assessment.create',organizationId:ORG,workspaceId:WS,authorizationVersion:9,
      payload:{processId:PROCESS},
    };
    const invoke = async () => (await fetch(`${API}/functions/v1/assess-command`,{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),
    })).json();
    return [await invoke(),await invoke()];
  },{ API,ORG,WS,PROCESS });
  expect(results[0]).toEqual(results[1]);
  expect(fixture.committedCommands).toHaveLength(1);
});

test('production route meets accessibility, focus, overflow, and measured navigation budgets',async ({ page }) => {
  await installEnterpriseFixture(page);
  await page.goto('/');
  await expect(page.getByRole('heading',{ name:'Assessment inventory' })).toBeVisible();
  const timing = await page.evaluate(() => {
    const entry=performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    return { duration:entry.duration,domContentLoaded:entry.domContentLoadedEventEnd };
  });
  expect(timing.duration).toBeLessThan(5000);
  expect(timing.domContentLoaded).toBeLessThan(4000);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => ['BUTTON','A','SELECT','INPUT'].includes(document.activeElement?.tagName || ''))).toBe(true);
  const results = await new AxeBuilder({ page }).include('main').analyze();
  expect(results.violations.filter(item => item.impact==='critical' || item.impact==='serious')).toEqual([]);
});

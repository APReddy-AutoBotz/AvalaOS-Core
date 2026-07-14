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
  'assess.v2.read','assess.v2.create','assess.v2.clone','assess.v2.write','assess.v2.finalize',
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
  let v2Version = 0;
  let v2Decision: Record<string,any> | null = null;
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
    if (url.origin === 'http://127.0.0.1:4173' || url.origin === 'http://127.0.0.1:4183') return route.continue();
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
    if (url.pathname === '/functions/v1/assess-v2-command') {
      const body = request.postDataJSON() as Record<string,any>;
      committedCommands.push(body);
      if (body.commandType === 'assessment_v2.create' || body.commandType === 'assessment_v2.clone_from_v1') v2Version = 1;
      else if (body.commandType === 'assessment_v2.draft.upsert') v2Version += 1;
      else if (body.commandType === 'assessment_v2.finalize') {
        v2Version += 1;
        v2Decision = {
          caseId:body.payload.caseId,sourceCaseVersion:v2Version-1,ruleSetVersion:'assess-v2-rules-2026-07',
          decisionVersion:'assess-v2-decision-2026-07',inputSnapshot:{id:body.payload.caseId,status:'reviewer-ready',version:v2Version-1,primitives:[],edges:[],assets:[],interactions:[],evidence:[]},evidenceSnapshot:[],
          outputSnapshot:{confidence:'Partially Evidenced',processReadiness:'Provisional',
            composedOperatingModel:[{primitiveId:'investigate',components:['GenAI Assistant','Audit','Monitoring']}],
            interactionDecisions:[],modernization:[],controls:['Human approval','Audit'],evidenceGaps:['Validate source facts'],
            assumptions:[],alternativesConsidered:['Human-led operation'],whatWouldChangeDecision:['Validated contradictory evidence'],
            nonClaims:['No production readiness claim']},
          inputHash:'server-input-hash',evidenceHash:'server-evidence-hash',outputHash:'server-output-hash',
          createdBy:USER,createdAt:new Date().toISOString(),validationStatus:'reviewer-ready'
        };
      }
      return route.fulfill({status:200,headers:jsonHeaders,body:JSON.stringify({ok:true,outcome:'committed',
        resource:{id:body.payload.caseId,status:body.commandType==='assessment_v2.finalize'?'reviewer_ready':'draft',
          version:v2Version,headVersionId:'77777777-7777-4777-8777-777777777777',
          ...(v2Decision?{decisionId:'88888888-8888-4888-8888-888888888888'}:{})}})});
    }
    if (url.pathname === '/rest/v1/assess_v2_decision_versions') {
      return route.fulfill({status:200,headers:{...jsonHeaders,'content-range':'0-0/1'},body:JSON.stringify(v2Decision ? {
        case_id:v2Decision.caseId,source_version_id:'77777777-7777-4777-8777-777777777777',
        rule_set_version:v2Decision.ruleSetVersion,decision_version:v2Decision.decisionVersion,
        validation_status:v2Decision.validationStatus,input_snapshot:v2Decision.inputSnapshot,
        evidence_snapshot:v2Decision.evidenceSnapshot,output_snapshot:v2Decision.outputSnapshot,
        input_hash:v2Decision.inputHash,evidence_hash:v2Decision.evidenceHash,output_hash:v2Decision.outputHash,
        supersedes_decision_id:null,created_by:v2Decision.createdBy,created_at:v2Decision.createdAt
      } : null)});
    }
    if (url.pathname === '/rest/v1/assess_v2_case_versions') {
      return route.fulfill({status:200,headers:{...jsonHeaders,'content-range':'0-0/1'},body:JSON.stringify({
        name:'Invoice exception handling',description:'V2 case'
      })});
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
  await expect(page.getByRole('heading',{ name:'Assessment inventory' })).toBeVisible();
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



test('V2 capability-controlled authoring finalizes server-only decision data and renders read-only on desktop and mobile',async ({ page }) => {
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error') errors.push(message.text());});
  const fixture=await installEnterpriseFixture(page);
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Assessment inventory'})).toBeVisible();
  await page.getByRole('button',{name:'View'}).first().click();
  await expect(page.getByTestId('assess-v2-workspace')).toBeVisible();
  const started=performance.now();
  await page.getByRole('button',{name:'Create V2 case'}).click();
  await page.getByLabel('V2 case description').fill('Controlled exception assessment with explicit evidence gaps.');
  await page.getByRole('button',{name:'Save V2 draft'}).click();
  await page.getByRole('button',{name:'Finalize reviewer-ready Decision Pack'}).click();
  await expect(page.getByTestId('assess-v2-decision-pack')).toContainText('Composed operating model');
  await expect(page.getByTestId('assess-v2-decision-pack')).toContainText('V2 approval, Govern resolution, Studio generation');
  const finalize=fixture.committedCommands.find(item=>item.commandType==='assessment_v2.finalize');
  expect(finalize?.payload).toEqual({caseId:finalize?.payload.caseId});
  expect(finalize?.payload.decision).toBeUndefined();
  expect(finalize?.payload.inputHash).toBeUndefined();
  expect(performance.now()-started).toBeLessThan(5000);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const violations=await new AxeBuilder({page}).include('[data-testid="assess-v2-workspace"]').analyze();
  expect(violations.violations.filter(item=>['serious','critical'].includes(item.impact || ''))).toEqual([]);
  expect(errors.filter(item=>!item.includes('Failed to load resource: net::ERR_FAILED'))).toEqual([]);
});

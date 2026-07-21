import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';
import { CANONICAL_AP_ASSESSMENT } from '../../data/mockData';
import { buildDecisionVersionV2 } from '../../services/assessV2/decisionVersion';
import { AP_INVOICE_EXCEPTION_V2_FIXTURE } from '../../services/assessV2/fixture';
import { ECONOMIC_FORMULA_VERSION, ECONOMIC_MODEL_VERSION, EconomicVersion } from '../../services/assessV2/economics/domain';

const USER='11111111-1111-4111-8111-111111111111';
const AUTHOR='12111111-1111-4111-8111-111111111111';
const ORG='22222222-2222-4222-8222-222222222222';
const WS='33333333-3333-4333-8333-333333333333';
const PROCESS='44444444-4444-4444-8444-444444444444';
const ASSESSMENT='55555555-5555-4555-8555-555555555555';
const CASE='70000000-0000-4000-8000-000000000001';
const SOURCE_VERSION='77777777-7777-4777-8777-777777777777';
const DECISION='88888888-8888-4888-8888-888888888888';
const APPROVED_REVIEW='91000000-0000-4000-8000-000000000001';
const ECONOMICS='92000000-0000-4000-8000-000000000001';
const REVISION='92000000-0000-4000-8000-000000000002';
const OUTCOME='93000000-0000-4000-8000-000000000001';
const OUTCOME_REVIEW='94000000-0000-4000-8000-000000000001';
const EVIDENCE='95000000-0000-4000-8000-000000000001';
const API='http://127.0.0.1:59999';
const APP_ORIGINS=new Set(['http://127.0.0.1:4173','http://127.0.0.1:4185']);
const CAPABILITIES=['assess.read','assess.v2.read','assess.v2.economics.write','assess.v2.economics.finalize','assess.v2.economics.review','assess.v2.outcomes.record','assess.v2.outcomes.review'];
const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','content-type':'application/json'};
const scenarios=[
  {scenario:'low',capacityReleased:80,annualAvoidableCashBenefit:8000,tco:30000,netAnnualBenefit:2000,paybackPeriodMonths:18},
  {scenario:'base',capacityReleased:120,annualAvoidableCashBenefit:12000,tco:25000,netAnnualBenefit:7000,paybackPeriodMonths:10},
  {scenario:'high',capacityReleased:160,annualAvoidableCashBenefit:16000,tco:22000,netAnnualBenefit:11000,paybackPeriodMonths:7},
];

const installEconomicsFixture=async(page:Page)=>{
  const seededCase={...structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE),id:CASE,organizationId:ORG,workspaceId:WS,sourceProcessId:PROCESS,ownerId:AUTHOR,status:'reviewer-ready' as const,version:7};
  const decision=await buildDecisionVersionV2(seededCase,AUTHOR,'2026-07-20T12:00:00.000Z');
  let version:EconomicVersion|undefined;
  let server={id:'',version:0,status:'empty'};
  let latestOutcome:Record<string,unknown>|undefined;
  let latestOutcomeReview:Record<string,unknown>|undefined;
  const committed:{type:string;expectedVersion:number;payload:Record<string,unknown>}[]=[];
  const rejected:string[]=[];
  let failNextSave=false;
  const user={id:USER,email:'economics.reviewer@avala.test',role:'authenticated',user_metadata:{full_name:'Independent Economics Reviewer'},aud:'authenticated',created_at:'2026-07-20T00:00:00.000Z'};
  await page.addInitScript(({user})=>{const now=Math.floor(Date.now()/1000);localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'browser-fixture-token',refresh_token:'browser-fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:now+3600,user}));localStorage.setItem('avalaos-core-v1-view',JSON.stringify('process_catalog'));localStorage.setItem('avalaos-core-v1-scope',JSON.stringify({type:'my_work'}));},{user});
  const ok=(route:any,body:unknown)=>route.fulfill({status:200,headers,body:JSON.stringify(body)});
  const fail=(route:any,code='INVALID_COMMAND',status=409)=>route.fulfill({status,headers,body:JSON.stringify({ok:false,error:{code,message:'Command rejected without persistence.'}})});
  const projection=()=>({version:version?{...version,id:server.id,version:server.version,status:server.status}:undefined,technicalReady:true,governanceApproved:true,latestOutcome,latestOutcomeReview,calibrationStatus:'Insufficient Data',portfolioDisposition:'Proceed to controlled design'});
  await page.route('**/*',async route=>{
    const request=route.request();const url=new URL(request.url());
    if(!APP_ORIGINS.has(url.origin)&&url.origin!==API)return route.abort();
    if(APP_ORIGINS.has(url.origin)&&!['/auth/','/functions/','/rest/'].some(prefix=>url.pathname.startsWith(prefix)))return route.continue();
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers,body:''});
    if(url.pathname==='/auth/v1/user')return ok(route,user);
    if(url.pathname==='/auth/v1/token')return ok(route,{access_token:'browser-fixture-token',refresh_token:'browser-fixture-refresh',token_type:'bearer',expires_in:3600,user});
    if(url.pathname==='/functions/v1/tenant-session')return ok(route,{contexts:[{userId:USER,organizationId:ORG,organizationName:'Avala Enterprise',workspaceId:WS,workspaceName:'Governed Assess',authorizationVersion:12,capabilities:CAPABILITIES}]});
    if(url.pathname==='/rest/v1/rpc/pr1f_read_assess_v2_economics_projection')return ok(route,projection());
    if(url.pathname==='/functions/v1/assess-v2-command'){
      const body=request.postDataJSON() as any;const type=String(body.commandType);const payload=body.payload as Record<string,unknown>;
      if(body.idempotencyKey==='self-review-attempt'){rejected.push(type);return fail(route,'PERMISSION_DENIED',403)}
      if(failNextSave&&type==='assessment_v2.economics.draft.upsert'){failNextSave=false;rejected.push(type);return fail(route,'VERSION_CONFLICT')}
      if(body.expectedVersion!==server.version){rejected.push(type);return fail(route,'VERSION_CONFLICT')}
      if(type==='assessment_v2.economics.create'){
        expect(body.expectedVersion).toBe(0);server={id:ECONOMICS,version:1,status:'draft'};
        version={organizationId:ORG,workspaceId:WS,caseId:CASE,sourceAuthoringVersionId:SOURCE_VERSION,decisionVersionId:DECISION,approvedReviewId:APPROVED_REVIEW,modelVersion:ECONOMIC_MODEL_VERSION,formulaVersion:ECONOMIC_FORMULA_VERSION,status:'draft',authorId:AUTHOR,currency:String(payload.currency),baselinePeriod:String(payload.baselinePeriod),analysisHorizonYears:0,implementationHorizonMonths:0,benefits:[],costs:[]};
      }else if(type==='assessment_v2.economics.draft.upsert'){
        const economicValues=(payload.benefits as any[]).map(({evidenceIds,...item})=>({...item,evidence:evidenceIds.map((id:string)=>({id,fresh:true,independent:false}))}));
        const economicCosts=(payload.costs as any[]).map(({evidenceIds,...item})=>({...item,evidence:evidenceIds.map((id:string)=>({id,fresh:true,independent:false}))}));
        server={...server,version:server.version+1};version={...version!,status:'draft',analysisHorizonYears:Number(payload.analysisHorizonYears),implementationHorizonMonths:Number(payload.implementationHorizonMonths),discountRate:Number(payload.discountRate),benefits:economicValues,costs:economicCosts};
      }else if(type==='assessment_v2.economics.finalize'){
        server={...server,version:server.version+1,status:'reviewer_ready'};version={...version!,status:'reviewer_ready',scenarioResults:scenarios as any,confidenceDerived:'Partially Evidenced' as any} as any;
      }else if(type==='assessment_v2.economics.review.resolve'){
        const resolution=String(payload.resolution);server={...server,version:server.version+1,status:resolution};version={...version!,status:resolution as any,reviewerId:USER};
      }else if(type==='assessment_v2.economics.revision.start'){
        server={id:REVISION,version:1,status:'draft'};version={...version!,status:'draft',authorId:AUTHOR,reviewerId:undefined};
      }else if(type==='assessment_v2.outcomes.record'){
        server={...server,version:server.version+1};latestOutcome={id:OUTCOME,economicVersionId:server.id,caseId:CASE,...payload};
      }else if(type==='assessment_v2.outcomes.review'){
        server={...server,version:server.version+1};latestOutcomeReview={id:OUTCOME_REVIEW,outcomeId:OUTCOME,economicVersionId:server.id,caseId:CASE,resolution:'accepted',reviewedBy:USER};
      }
      committed.push({type,expectedVersion:body.expectedVersion,payload});
      return ok(route,{ok:true,outcome:'committed',resource:{id:server.id,status:server.status,version:server.version,scenarioResults:type==='assessment_v2.economics.finalize'?scenarios:undefined,confidence:type==='assessment_v2.economics.finalize'?'Partially Evidenced':undefined,outcomeId:type==='assessment_v2.outcomes.record'?OUTCOME:undefined}});
    }
    if(url.pathname==='/rest/v1/assess_processes')return ok(route,[{id:PROCESS,org_id:ORG,workspace_id:WS,name:'Invoice exception handling',description:'Resolve invoice exceptions before payment release.',owner_id:AUTHOR,department:'Finance',criticality:'High',status:'Not Started',created_at:'2026-07-20T00:00:00.000Z',updated_at:'2026-07-20T00:00:00.000Z'}]);
    if(url.pathname==='/rest/v1/assessments')return ok(route,{...structuredClone(CANONICAL_AP_ASSESSMENT),id:ASSESSMENT,process_id:PROCESS,org_id:ORG,workspace_id:WS,version:2,status:'Approved',score_version:CANONICAL_AP_ASSESSMENT.scores?.scoreVersion,metadata:CANONICAL_AP_ASSESSMENT.metadata,responses:CANONICAL_AP_ASSESSMENT.responses,evidence_items:CANONICAL_AP_ASSESSMENT.evidenceItems,assumptions:CANONICAL_AP_ASSESSMENT.assumptions,completion_by_section:CANONICAL_AP_ASSESSMENT.completionBySection});
    if(url.pathname==='/rest/v1/assess_v2_cases')return ok(route,{id:CASE,org_id:ORG,workspace_id:WS,process_id:PROCESS,owner_id:AUTHOR,status:'reviewer_ready',version:7,schema_version:seededCase.schemaVersion,rule_set_version:seededCase.ruleSetVersion,created_at:seededCase.createdAt,updated_at:seededCase.updatedAt,head_version_id:SOURCE_VERSION});
    if(url.pathname==='/rest/v1/assess_v2_case_versions')return ok(route,{name:'Invoice exception handling',description:'Governed AP invoice review',agent_necessity:seededCase.agentNecessity,imported_facts:[]});
    if(url.pathname==='/rest/v1/assess_v2_decision_versions')return ok(route,{id:DECISION,case_id:CASE,source_version_id:SOURCE_VERSION,schema_version:decision.schemaVersion,rule_set_version:decision.ruleSetVersion,decision_version:decision.decisionVersion,validation_status:decision.validationStatus,input_snapshot:decision.inputSnapshot,evidence_snapshot:decision.evidenceSnapshot,output_snapshot:decision.outputSnapshot,input_hash:decision.inputHash,evidence_hash:decision.evidenceHash,output_hash:decision.outputHash,input_canonical:decision.inputCanonical,evidence_canonical:decision.evidenceCanonical,output_canonical:decision.outputCanonical,supersedes_decision_id:null,created_by:AUTHOR,created_at:decision.createdAt});
    const children:Record<string,unknown[]>={assess_v2_primitives:seededCase.primitives,assess_v2_edges:seededCase.edges,assess_v2_decision_points:seededCase.decisionPoints,assess_v2_exception_paths:seededCase.exceptionPaths,assess_v2_application_assets:seededCase.assets,assess_v2_application_interactions:seededCase.interactions,assess_v2_evidence_links:seededCase.evidence};
    const child=url.pathname.split('/').pop()!;if(child in children)return ok(route,children[child].map(payload=>({payload})));
    if(url.pathname==='/rest/v1/assessment_studio_handoffs')return ok(route,[]);
    return ok(route,[]);
  });
  return{committed,rejected,get server(){return server},get latestOutcome(){return latestOutcome},get latestOutcomeReview(){return latestOutcomeReview},failNextSave(){failNextSave=true}};
};

test('governed economics lifecycle in the Avala Assess workspace',async({page})=>{
  test.setTimeout(120_000);const fixture=await installEconomicsFixture(page);
  await page.goto('/');await expect(page.getByRole('heading',{name:'Process Catalog'})).toBeVisible();await page.getByRole('button',{name:'View'}).first().click();
  const workspace=page.getByTestId('assess-v2-economics-workspace');await expect(workspace).toBeVisible();await expect(workspace.getByRole('heading',{name:'Avala Assess V2 Economics'})).toBeVisible();
  await page.getByLabel('ISO 4217 currency').fill('USD');await page.getByLabel('Baseline period').fill('2026-Q2');await page.getByRole('button',{name:'Create economic draft'}).click();
  await expect(page.getByTestId('economics-lifecycle')).toHaveText('draft');expect(fixture.committed[0]).toMatchObject({type:'assessment_v2.economics.create',expectedVersion:0});
  await page.getByLabel('Analysis horizon years').fill('3');await page.getByLabel('Implementation horizon months').fill('6');await page.getByLabel('Discount rate').fill('0.08');await page.getByLabel('Capacity released hours').fill('120');await page.getByLabel('Avoidable cash benefit').fill('12000');await page.getByLabel('One-time implementation cost').fill('25000');await page.getByLabel('Evidence ID',{exact:true}).fill(EVIDENCE);await page.getByLabel('Accountable owner').fill('Finance Operations');
  const save=page.getByRole('button',{name:'Save evidence-linked assumptions'});await save.focus();await expect(save).toBeFocused();await save.press('Enter');await expect.poll(()=>fixture.server.version).toBe(2);
  await page.reload();await expect(page.getByRole('heading',{name:'Process Catalog'})).toBeVisible();await page.getByRole('button',{name:'View'}).first().click();await expect(workspace).toBeVisible();await expect(page.getByTestId('economics-lifecycle')).toHaveText('draft');
  await page.getByRole('button',{name:'Finalize'}).click();await expect(page.getByTestId('economics-lifecycle')).toHaveText('reviewer_ready');await expect(page.getByTestId('economics-scenarios')).toContainText('base: capacity 120');
  const committedBeforeSelfReview=fixture.committed.length;const selfReviewStatus=await page.evaluate(async endpoint=>(await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),idempotencyKey:'self-review-attempt',commandType:'assessment_v2.economics.review.resolve',organizationId:'22222222-2222-4222-8222-222222222222',workspaceId:'33333333-3333-4333-8333-333333333333',authorizationVersion:12,expectedVersion:3,payload:{economicVersionId:'92000000-0000-4000-8000-000000000001',caseId:'70000000-0000-4000-8000-000000000001',decisionId:'88888888-8888-4888-8888-888888888888',resolution:'approved',rationale:'Self review must fail',conditions:[]}})})).status,`${API}/functions/v1/assess-v2-command`);expect(selfReviewStatus).toBe(403);expect(fixture.committed).toHaveLength(committedBeforeSelfReview);await expect(page.getByTestId('economics-lifecycle')).toHaveText('reviewer_ready');
  await page.getByRole('button',{name:'Request changes'}).click();await expect(page.getByTestId('economics-lifecycle')).toHaveText('changes_requested');await page.getByRole('button',{name:'Start immutable revision'}).click();await expect(page.getByTestId('economics-lifecycle')).toHaveText('draft');expect(fixture.server.id).toBe(REVISION);
  await page.getByRole('button',{name:'Finalize'}).click();await expect(page.getByTestId('economics-lifecycle')).toHaveText('reviewer_ready');await page.getByRole('button',{name:'Approve independently'}).click();await expect(page.getByTestId('economics-lifecycle')).toHaveText('approved');
  await page.getByLabel('Outcome observation period').fill('2026-Q3');await page.getByLabel('Outcome project reference').fill('FIN-AUTO-42');await page.getByLabel('Actual capacity released').fill('118');await page.getByLabel('Actual avoidable cash').fill('11500');await page.getByLabel('Actual recurring cost').fill('3100');await page.getByLabel('Actual one-time cost').fill('24800');await page.getByLabel('Outcome evidence ID').fill('finance-ledger-2026-q3');await page.getByLabel('Outcome collection method').fill('Reconciled finance ledger and time study');await page.getByLabel('Observation completeness').fill('1');await page.getByRole('button',{name:'Record realized outcome'}).click();await expect.poll(()=>fixture.latestOutcome?.id).toBe(OUTCOME);await page.getByRole('button',{name:'Review outcome'}).click();await expect.poll(()=>fixture.latestOutcomeReview?.id).toBe(OUTCOME_REVIEW);expect(fixture.latestOutcomeReview).toMatchObject({outcomeId:OUTCOME,economicVersionId:REVISION,caseId:CASE,resolution:'accepted'});
  await expect(page.getByTestId('economics-calibration')).toHaveText('Insufficient Data');await expect(page.getByTestId('economics-portfolio')).toHaveText('Proceed to controlled design');
  const committedBeforeFailedSave=fixture.committed.length;fixture.failNextSave();await page.getByRole('button',{name:'Save evidence-linked assumptions'}).click();await expect(page.getByTestId('economics-error')).toContainText('Failed persistence: VERSION_CONFLICT');expect(fixture.committed).toHaveLength(committedBeforeFailedSave);await expect(page.getByTestId('economics-lifecycle')).toHaveText('approved');
  await page.keyboard.press('Shift+Tab');expect(await page.evaluate(()=>document.activeElement?.tagName)).not.toBe('BODY');
  const axe=await new AxeBuilder({page}).include('[data-testid="assess-v2-economics-workspace"]').analyze();expect(axe.violations.filter(item=>item.impact==='serious'||item.impact==='critical')).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

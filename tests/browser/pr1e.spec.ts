import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';
import { CANONICAL_AP_ASSESSMENT } from '../../data/mockData';
import { buildDecisionVersionV2 } from '../../services/assessV2/decisionVersion';
import { AP_INVOICE_EXCEPTION_V2_FIXTURE } from '../../services/assessV2/fixture';

const USER='11111111-1111-4111-8111-111111111111';
const AUTHOR='12111111-1111-4111-8111-111111111111';
const ORG='22222222-2222-4222-8222-222222222222';
const WS='33333333-3333-4333-8333-333333333333';
const PROCESS='44444444-4444-4444-8444-444444444444';
const ASSESSMENT='55555555-5555-4555-8555-555555555555';
const CASE='70000000-0000-4000-8000-000000000001';
const DECISION='88888888-8888-4888-8888-888888888888';
const VERSION='77777777-7777-4777-8777-777777777777';
const ASSIGNMENT='99999999-9999-4999-8999-999999999999';
const API='http://127.0.0.1:59999';
const EVIDENCE=['71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002'];
const CAPABILITIES=['assess.read','assess.v2.read','assess.v2.review','assess.v2.evidence.attest','assess.v2.approve','assess.v2.govern.resolve','assess.v2.studio.handoff'];
const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','content-type':'application/json'};

const installGovernedReviewFixture=async(page:Page)=>{
  const seededCase={...structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE),id:CASE,organizationId:ORG,workspaceId:WS,sourceProcessId:PROCESS,ownerId:AUTHOR,status:'reviewer-ready' as const,version:3};
  const decision=await buildDecisionVersionV2(seededCase,AUTHOR,'2026-07-20T12:00:00.000Z');
  let projection:any={
    assignmentId:'',caseId:CASE,caseName:'Invoice exception handling',caseVersion:3,sourceCaseVersion:2,sourceVersionId:VERSION,
    decisionId:DECISION,decisionVersion:decision.decisionVersion,reviewSchemaVersion:'assess-v2-review-2026-07',reviewSequence:1,status:'reviewer_ready',
    authorLabel:'Assessment Author',reviewerLabel:'',confidence:'Partially Evidenced',conditions:[],requiredClaimIds:['claim.invoice-source','claim.approval-control'],
    evidence:[
      {id:EVIDENCE[0],claimIds:['claim.invoice-source'],sourceType:'system-record',submitterLabel:'Assessment Author',capturedAt:'2026-07-20T10:00:00.000Z',status:'submitted'},
      {id:EVIDENCE[1],claimIds:['claim.approval-control'],sourceType:'test',submitterLabel:'Assessment Author',capturedAt:'2026-07-20T10:05:00.000Z',status:'submitted'},
    ],
    actions:[{id:'post-invoice',label:'Post approved invoice',category:'approval-bound'},{id:'delete-ledger',label:'Delete ledger entry',category:'prohibited'}],
    controls:[{controlId:'human-approval',label:'Human approval',status:'unresolved'},{controlId:'audit',label:'Immutable audit',status:'unresolved'}],
    governStatus:'pending',handoffStatus:'not_ready',
  };
  const committed:string[]=[]; const rejected:string[]=[]; let failNextAttestation=true;
  const user={id:USER,email:'reviewer@avala.test',role:'authenticated',user_metadata:{full_name:'Independent Reviewer'},aud:'authenticated',created_at:'2026-07-20T00:00:00.000Z'};
  await page.addInitScript(({user})=>{const now=Math.floor(Date.now()/1000);localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'browser-fixture-token',refresh_token:'browser-fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:now+3600,user}));localStorage.setItem('avalaos-core-v1-view',JSON.stringify('process_catalog'));localStorage.setItem('avalaos-core-v1-scope',JSON.stringify({type:'my_work'}));},{user});
  const ok=(route:any,body:unknown)=>route.fulfill({status:200,headers,body:JSON.stringify(body)});
  const fail=(route:any,code='INVALID_COMMAND')=>route.fulfill({status:409,headers,body:JSON.stringify({ok:false,error:{code,message:'Command rejected without persistence.'}})});
  await page.route('**/*',async route=>{
    const request=route.request(); const url=new URL(request.url());
    if(url.origin==='http://127.0.0.1:4184')return route.continue();
    if(url.origin!==API)return route.abort();
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers,body:''});
    if(url.pathname==='/auth/v1/user')return ok(route,user);
    if(url.pathname==='/auth/v1/token')return ok(route,{access_token:'browser-fixture-token',refresh_token:'browser-fixture-refresh',token_type:'bearer',expires_in:3600,user});
    if(url.pathname==='/functions/v1/tenant-session')return ok(route,{contexts:[{userId:USER,organizationId:ORG,organizationName:'Avala Enterprise',workspaceId:WS,workspaceName:'Governed Assess',authorizationVersion:9,capabilities:CAPABILITIES}]});
    if(url.pathname==='/rest/v1/rpc/assess_v2_review_queue')return ok(route,projection.assignmentId?[{assignmentId:ASSIGNMENT,caseId:CASE,caseName:projection.caseName,status:projection.status==='reviewer_ready'?'in_review':projection.status}]:[]);
    if(url.pathname==='/rest/v1/rpc/assess_v2_review_workspace')return ok(route,projection);
    if(url.pathname==='/rest/v1/rpc/assess_v2_eligible_reviewers')return ok(route,projection.status==='reviewer_ready'?[{actorId:USER,label:'Independent Reviewer',authorizationVersion:9}]:[]);
    if(url.pathname==='/functions/v1/assess-v2-command'){
      const body=request.postDataJSON() as any; const type=String(body.commandType);
      if(body.expectedVersion!==projection.caseVersion){rejected.push(type);return fail(route,'VERSION_CONFLICT');}
      if(type==='assessment_v2.review.assign'){
        if(body.payload.reviewerId!==USER){rejected.push(type);return fail(route);}
        projection={...projection,assignmentId:ASSIGNMENT,caseVersion:4,status:'in_review',reviewerLabel:'Independent Reviewer'};
      }else if(type==='assessment_v2.evidence.attest'){
        if(failNextAttestation){failNextAttestation=false;rejected.push(type);return fail(route,'VERSION_CONFLICT');}
        projection={...projection,evidence:projection.evidence.map((item:any)=>item.id===body.payload.evidenceId?{...item,status:'accepted',rationale:body.payload.rationale}:item)};
      }else if(type==='assessment_v2.review.resolve'){
        if(projection.evidence.some((item:any)=>item.status!=='accepted')){rejected.push(type);return fail(route,'VERSION_CONFLICT');}
        projection={...projection,caseVersion:5,status:'approved',confidence:'Verified'};
      }else if(type==='assessment_v2.govern.resolve'){
        if(body.payload.controlDispositions.some((control:any)=>control.status!=='resolved')){rejected.push(type);return fail(route);}
        projection={...projection,caseVersion:6,governStatus:'resolved',handoffStatus:'ready',controls:body.payload.controlDispositions};
      }else if(type==='assessment_v2.studio.handoff'){
        if(projection.governStatus!=='resolved'){rejected.push(type);return fail(route);}
        projection={...projection,caseVersion:7,handoffStatus:'committed',handedOffAt:'2026-07-20T13:00:00.000Z'};
      }
      committed.push(type);return ok(route,{ok:true,outcome:'committed',resource:projection});
    }
    if(url.pathname==='/rest/v1/assess_processes')return ok(route,[{id:PROCESS,org_id:ORG,workspace_id:WS,name:'Invoice exception handling',description:'Resolve invoice exceptions before payment release.',owner_id:AUTHOR,department:'Finance',criticality:'High',status:'Not Started',created_at:'2026-07-20T00:00:00.000Z',updated_at:'2026-07-20T00:00:00.000Z'}]);
    if(url.pathname==='/rest/v1/assessments')return ok(route,{...structuredClone(CANONICAL_AP_ASSESSMENT),id:ASSESSMENT,process_id:PROCESS,org_id:ORG,workspace_id:WS,version:2,status:'Approved',score_version:CANONICAL_AP_ASSESSMENT.scores?.scoreVersion,metadata:CANONICAL_AP_ASSESSMENT.metadata,responses:CANONICAL_AP_ASSESSMENT.responses,evidence_items:CANONICAL_AP_ASSESSMENT.evidenceItems,assumptions:CANONICAL_AP_ASSESSMENT.assumptions,completion_by_section:CANONICAL_AP_ASSESSMENT.completionBySection});
    if(url.pathname==='/rest/v1/assess_v2_cases')return ok(route,{id:CASE,org_id:ORG,workspace_id:WS,process_id:PROCESS,owner_id:AUTHOR,status:projection.status==='reviewer_ready'?'reviewer_ready':projection.status,version:projection.caseVersion,schema_version:seededCase.schemaVersion,rule_set_version:seededCase.ruleSetVersion,created_at:seededCase.createdAt,updated_at:seededCase.updatedAt,head_version_id:VERSION});
    if(url.pathname==='/rest/v1/assess_v2_case_versions')return ok(route,{name:'Invoice exception handling',description:'Governed AP invoice review',agent_necessity:seededCase.agentNecessity,imported_facts:[]});
    if(url.pathname==='/rest/v1/assess_v2_decision_versions')return ok(route,{case_id:CASE,source_version_id:VERSION,schema_version:decision.schemaVersion,rule_set_version:decision.ruleSetVersion,decision_version:decision.decisionVersion,validation_status:decision.validationStatus,input_snapshot:decision.inputSnapshot,evidence_snapshot:decision.evidenceSnapshot,output_snapshot:decision.outputSnapshot,input_hash:decision.inputHash,evidence_hash:decision.evidenceHash,output_hash:decision.outputHash,input_canonical:decision.inputCanonical,evidence_canonical:decision.evidenceCanonical,output_canonical:decision.outputCanonical,supersedes_decision_id:null,created_by:AUTHOR,created_at:decision.createdAt});
    const children:Record<string,unknown[]>={assess_v2_primitives:seededCase.primitives,assess_v2_edges:seededCase.edges,assess_v2_decision_points:seededCase.decisionPoints,assess_v2_exception_paths:seededCase.exceptionPaths,assess_v2_application_assets:seededCase.assets,assess_v2_application_interactions:seededCase.interactions,assess_v2_evidence_links:seededCase.evidence};
    const child=url.pathname.split('/').pop()!;if(child in children)return ok(route,children[child].map(payload=>({payload})));
    if(url.pathname==='/rest/v1/assessment_studio_handoffs')return ok(route,[]);
    return ok(route,[]);
  });
  return{committed,rejected,get projection(){return projection;}};
};

test('governed reviewer assignment through durable Studio handoff',async({page})=>{
  test.setTimeout(90_000);const fixture=await installGovernedReviewFixture(page);
  await page.goto('/');await expect(page.getByRole('heading',{name:'Process Catalog'})).toBeVisible();await page.getByRole('button',{name:'View'}).first().click();
  const workspace=page.getByTestId('assess-v2-review-workspace');await expect(workspace).toBeVisible();
  const reviewer=page.getByLabel('Eligible reviewer');await expect(reviewer).toHaveValue(USER);await reviewer.focus();await expect(reviewer).toBeFocused();
  const assign=page.getByRole('button',{name:'Commit reviewer assignment'});await assign.focus();await assign.press('Enter');
  await expect(page.getByText(/Reviewer assignment committed/)).toBeVisible();await expect(page.getByRole('navigation',{name:'Assigned-review queue'})).toContainText('In review');
  const rationales=page.getByLabel('Reviewer rationale');await rationales.nth(0).fill('Independent source check.');const firstAccept=page.getByRole('button',{name:'Accept evidence'}).nth(0);await expect(firstAccept).toBeEnabled();await firstAccept.click();await expect.poll(()=>fixture.rejected.length).toBe(1);
  await expect(page.getByText(/changed on the server/i)).toBeVisible();await expect(page.getByText(/Evidence attestation committed/)).toHaveCount(0);
  await page.getByLabel('Reviewer rationale').nth(0).fill('Independent source check retry.');await page.getByRole('button',{name:'Accept evidence'}).nth(0).click();await expect(page.getByText('Evidence attestation committed: Evidence accepted.')).toBeVisible();
  await page.getByLabel('Review rationale').fill('All material claims independently checked.');await page.getByRole('button',{name:'Approve reviewed decision'}).click();
  await expect(page.getByText(/changed on the server/i)).toBeVisible();expect(fixture.rejected).toContain('assessment_v2.review.resolve');
  await page.getByLabel('Reviewer rationale').fill('Independent control evidence check.');await page.getByRole('button',{name:'Accept evidence'}).click();
  await page.getByLabel('Review rationale').fill('All material claims independently checked after reload.');await page.getByRole('button',{name:'Approve reviewed decision'}).click();await expect(page.getByText('Review resolution committed: Approved.')).toBeVisible();await expect(workspace).toContainText('Verified');
  await page.getByLabel('Govern rationale').fill('Required controls independently resolved.');const govern=page.getByRole('button',{name:'Resolve Govern controls'});await expect(govern).toBeDisabled();
  const unresolvedAttempt=await page.evaluate(async({endpoint,org,workspace,caseId,decisionId})=>{const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer browser-fixture-token'},body:JSON.stringify({requestId:crypto.randomUUID(),idempotencyKey:'unresolved-control-attempt',commandType:'assessment_v2.govern.resolve',organizationId:org,workspaceId:workspace,authorizationVersion:9,expectedVersion:5,payload:{caseId,decisionId,reviewSequence:1,rationale:'Must fail',controlDispositions:[{controlId:'human-approval',status:'unresolved',condition:'',owner:'',dueDate:'',conditionSatisfied:false},{controlId:'audit',status:'resolved',condition:'',owner:'',dueDate:'',conditionSatisfied:false}]}})});return response.status;},{endpoint:`${API}/functions/v1/assess-v2-command`,org:ORG,workspace:WS,caseId:CASE,decisionId:DECISION});
  expect(unresolvedAttempt).toBe(409);expect(fixture.committed.filter(type=>type==='assessment_v2.govern.resolve')).toHaveLength(0);
  for(const select of await page.getByLabel(/^Disposition for /).all())await select.selectOption('resolved');await expect(govern).toBeEnabled();await govern.click();await expect(page.getByText('Govern resolution committed.')).toBeVisible();
  await page.getByRole('button',{name:'Create durable Studio handoff'}).click();await expect(page.getByText('Studio handoff committed.')).toBeVisible();await expect(workspace).toContainText('Handed off to Studio');
  await page.getByRole('button',{name:'Reload committed state'}).click();await expect(workspace).toContainText('Handed off to Studio');expect(fixture.projection.handoffStatus).toBe('committed');
  expect(fixture.committed).toEqual(['assessment_v2.review.assign','assessment_v2.evidence.attest','assessment_v2.evidence.attest','assessment_v2.review.resolve','assessment_v2.govern.resolve','assessment_v2.studio.handoff']);
  const axe=await new AxeBuilder({page}).include('[data-testid="assess-v2-review-workspace"]').analyze();expect(axe.violations.filter(item=>item.impact==='serious'||item.impact==='critical')).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

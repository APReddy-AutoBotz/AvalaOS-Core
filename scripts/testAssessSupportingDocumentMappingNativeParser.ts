import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {basename,dirname,resolve} from 'node:path';
import {parseAssessV2DraftPayload} from '../supabase/functions/_shared/assessV2Command.ts';
import {evaluateAssessmentV2,evaluateCandidateFit,evaluateInteractionReadiness,validateAssessmentV2} from '../services/assessV2/evaluator.ts';
import {ASSESS_V2_RULE_SET_VERSION,ASSESS_V2_SCHEMA_VERSION,type AssessmentCaseV2} from '../services/assessV2/types.ts';

const input=process.env.ASSESS_MAPPING_NATIVE_PAYLOAD_PATH;
if(!input)throw new Error('ASSESS_MAPPING_NATIVE_PAYLOAD_NOT_RUN');
const resolved=realpathSync(resolve(input));
const ownedRoot=realpathSync(resolve('output/test-runs/assess-mapping-native'));
if(dirname(resolved)!==ownedRoot||!basename(resolved).startsWith('payload-')||!basename(resolved).endsWith('.json'))throw new Error('ASSESS_MAPPING_NATIVE_PAYLOAD_SCOPE_INVALID');
const payload=JSON.parse(readFileSync(resolved,'utf8'));
assert.deepEqual(Object.keys(payload).sort(),['draft','persisted'].sort());
const parsed=parseAssessV2DraftPayload(payload.draft);
assert.equal(parsed.primitives.length,2);
assert.equal(parsed.assets.length,2);
assert.equal(parsed.interactions.length,2);
assert.equal(parsed.decisionPoints.length,1);
assert.equal(parsed.exceptionPaths.length,1);
const mapped=parsed.primitives.find(item=>item.name==='Manual review');
assert.ok(mapped);
assert.equal(mapped.facts['primitive.ambiguityCharacterized'].fieldId,'primitive.ambiguityCharacterized');
assert.equal(Object.hasOwn(mapped.facts,'ambiguityCharacterized'),false);
assert.equal(mapped.facts['primitive.rulesStable'].fieldId,'primitive.rulesStable');
const createdInteraction=parsed.interactions.find(item=>item.operationName==='Read policy');
assert.deepEqual(createdInteraction?.facts&&{
  highImpact:createdInteraction.facts.highImpact,
  financialAction:createdInteraction.facts.financialAction,
  untrustedContentWithTools:createdInteraction.facts.untrustedContentWithTools,
},{highImpact:false,financialAction:false,untrustedContentWithTools:true});

const persisted=payload.persisted;
assert.deepEqual(Object.keys(persisted).sort(),['createdAt','importedFacts','organizationId','ownerId','processId','updatedAt','version','workspaceId'].sort());
const exactCase:AssessmentCaseV2={id:parsed.caseId,organizationId:persisted.organizationId,workspaceId:persisted.workspaceId,sourceProcessId:persisted.processId,ownerId:persisted.ownerId,status:'draft',version:persisted.version,schemaVersion:ASSESS_V2_SCHEMA_VERSION,ruleSetVersion:ASSESS_V2_RULE_SET_VERSION,importedFacts:persisted.importedFacts,primitives:parsed.primitives,edges:parsed.edges,decisionPoints:parsed.decisionPoints,exceptionPaths:parsed.exceptionPaths,assets:parsed.assets,interactions:parsed.interactions as unknown as AssessmentCaseV2['interactions'],evidence:parsed.evidence,agentNecessity:parsed.agentNecessity,createdAt:persisted.createdAt,updatedAt:persisted.updatedAt};
const mappedFit=evaluateCandidateFit(mapped,'Dynamic Case Management',exactCase.evidence,exactCase.updatedAt);
assert.equal(mappedFit.fieldIds.includes('primitive.ambiguityCharacterized'),true);
assert.notEqual(mappedFit.fit,'Ineligible');
assert.equal(evaluateInteractionReadiness(createdInteraction as unknown as AssessmentCaseV2['interactions'][number]).readiness.read,'Unknown');
const finalizationErrors=validateAssessmentV2(exactCase);
assert.ok(finalizationErrors.some(error=>/edge between distinct process primitives/.test(error)));
assert.ok(finalizationErrors.some(error=>/exception path.*resolution primitive/.test(error)));
assert.throws(()=>evaluateAssessmentV2(exactCase),/Invalid Assess V2 case.*meaningful finalization/);

const rejected=(mutate:(copy:any)=>void)=>{const copy=structuredClone(payload.draft);mutate(copy);assert.throws(()=>parseAssessV2DraftPayload(copy),/INVALID_COMMAND/)};
rejected(copy=>{copy.primitives[0].name='n'.repeat(201)});
rejected(copy=>{copy.primitives[0].trigger='t'.repeat(501)});
rejected(copy=>{copy.decisionPoints[0].ruleDescription='r'.repeat(2001)});
rejected(copy=>{copy.exceptionPaths[0].trigger='e'.repeat(2001)});
rejected(copy=>{delete copy.interactions.find((item:any)=>item.operationName==='Read policy').facts.highImpact});
rejected(copy=>{copy.interactions.find((item:any)=>item.operationName==='Read policy').facts.financialAction=null});
console.log('ASSESS_DOCUMENT_MAPPING_NATIVE_PARSER assertions passed');

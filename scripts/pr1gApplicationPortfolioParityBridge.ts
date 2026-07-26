import { readFileSync } from 'node:fs';
import {
  APPLICATION_DIMENSIONS,
  assessApplication,
  type ApplicationMetadata,
  type ApplicationRecord,
  type DimensionResult,
  type EvidenceRef,
  type Recommendation,
} from '../services/assessV2/applicationPortfolio';

type PostgreSqlDimension = DimensionResult;
type PostgreSqlRecommendation = Recommendation;
type Fixture = {
  name:string;
  applicationId:string;
  orgId:string;
  workspaceId:string;
  metadataVersion:number;
  metadata:ApplicationMetadata;
  evidence:EvidenceRef[];
  postgres:{dimensions:PostgreSqlDimension[];recommendation:PostgreSqlRecommendation};
};

const [inputPath]=process.argv.slice(2);
if(!inputPath)throw new Error('PR1G_PARITY_INPUT_REQUIRED');
const fixtures=JSON.parse(readFileSync(inputPath,'utf8')) as Fixture[];
const unorderedStrings=new Set(['hardGates','missingEvidence','affectedProcesses','affectedPrimitives','dependencyImpacts','openEvidenceGaps']);
const canonicalEvidence=(values:EvidenceRef[])=>values.map(value=>({
  id:value.id,
  claimIds:[...value.claimIds].sort(),
  sourceType:value.sourceType,
  fresh:value.fresh,
  independent:value.independent,
  accepted:value.accepted,
  contradicts:value.contradicts??false,
  synthetic:value.synthetic??false,
})).sort((left,right)=>left.id.localeCompare(right.id));
const normalize=(field:string,value:unknown)=>{
  if(field==='evidenceReferences')return canonicalEvidence(value as EvidenceRef[]);
  if(unorderedStrings.has(field))return [...(value as string[])].sort();
  return value;
};
const equal=(left:unknown,right:unknown)=>JSON.stringify(left)===JSON.stringify(right);
const mismatch=(fixture:string,scope:string,field:string,left:unknown,right:unknown)=>{
  throw new Error(`${fixture}:${scope}:${field}: TYPESCRIPT=${JSON.stringify(left)} POSTGRESQL=${JSON.stringify(right)}`);
};

const dimensionFields:(keyof DimensionResult)[]=[
  'dimension','band','confidence','hardGates','evidenceReferences','missingEvidence','rationale','contradictions','remediationRequirements','whatWouldChange',
];
const recommendationFields:(keyof Recommendation)[]=[
  'disposition','applicationId','metadataVersion','affectedProcesses','affectedPrimitives','why','alternativesConsidered','alternativesRejected','prerequisites','requiredControls','migrationBoundary','dependencyImpacts','rollback','confidence','openEvidenceGaps','whatWouldChange',
];

function compareFixture(fixture:Fixture){
  const application:ApplicationRecord={
    id:fixture.applicationId,
    orgId:fixture.orgId,
    workspaceId:fixture.workspaceId,
    version:1,
    metadataVersion:fixture.metadataVersion,
    metadata:fixture.metadata,
    authorId:'44444444-4444-4444-8444-444444444444',
    status:'draft',
    evidence:fixture.evidence,
  };
  const typescript=assessApplication(application);
  const postgresByName=new Map(fixture.postgres.dimensions.map(dimension=>[dimension.dimension,dimension]));
  const typescriptNames=typescript.dimensions.map(dimension=>dimension.dimension).sort();
  const postgresNames=fixture.postgres.dimensions.map(dimension=>dimension.dimension).sort();
  const expectedNames=[...APPLICATION_DIMENSIONS].sort();
  if(!equal(typescriptNames,expectedNames)||!equal(postgresNames,expectedNames))mismatch(fixture.name,'dimensions','dimension',typescriptNames,postgresNames);
  for(const dimension of typescript.dimensions){
    const postgres=postgresByName.get(dimension.dimension);
    if(!postgres)throw new Error(`${fixture.name}:${dimension.dimension}:dimension: POSTGRES_DIMENSION_MISSING`);
    for(const field of dimensionFields){
      const left=normalize(field,dimension[field]);
      const right=normalize(field,postgres[field]);
      if(!equal(left,right))mismatch(fixture.name,dimension.dimension,field,left,right);
    }
  }
  const recommendation=typescript.recommendations[0];
  if(!recommendation)throw new Error(`${fixture.name}:recommendation:disposition: TYPESCRIPT_RECOMMENDATION_MISSING`);
  for(const field of recommendationFields){
    const left=normalize(field,recommendation[field]);
    const right=normalize(field,fixture.postgres.recommendation[field]);
    if(!equal(left,right))mismatch(fixture.name,'recommendation',field,left,right);
  }
}

for(const fixture of fixtures)compareFixture(fixture);

const adversarialDimensionFields:(keyof DimensionResult)[]=[
  'dimension','band','confidence','hardGates','evidenceReferences','missingEvidence','rationale','contradictions','remediationRequirements','whatWouldChange',
];
const adversarialRecommendationFields:(keyof Recommendation)[]=[
  'disposition','applicationId','metadataVersion','affectedProcesses','affectedPrimitives','why','alternativesConsidered','alternativesRejected','prerequisites','requiredControls','migrationBoundary','dependencyImpacts','rollback','confidence','openEvidenceGaps','whatWouldChange',
];
const mutate=(field:string,value:unknown):unknown=>{
  if(field==='metadataVersion')return Number(value)+1;
  if(field==='dimension')return 'mutated_dimension';
  if(field==='band')return value==='Ready'?'Blocked':'Ready';
  if(field==='confidence')return value==='Verified'?'Assumption-Led':'Verified';
  if(field==='disposition')return value==='Retain and monitor'?'Retire':'Retain and monitor';
  if(field==='applicationId'||field==='migrationBoundary'||field==='rollback')return `${String(value)} [mutated]`;
  if(field==='evidenceReferences'){
    const evidence=structuredClone(value as EvidenceRef[]);
    if(evidence.length)evidence[0].accepted=!evidence[0].accepted;
    else evidence.push({id:'mutated',claimIds:['integration_accessibility'],sourceType:'test',fresh:true,independent:true,accepted:true});
    return evidence;
  }
  return [...(value as unknown[]),`MUTATED_${field}`];
};
const baseline=fixtures[0];
if(!baseline)throw new Error('PR1G_PARITY_FIXTURE_REQUIRED');
for(const field of adversarialDimensionFields){
  const candidate=structuredClone(baseline);
  const dimension=candidate.postgres.dimensions[0];
  dimension[field]=mutate(field,dimension[field]) as never;
  try{
    compareFixture(candidate);
    throw new Error(`${baseline.name}:${dimension.dimension}:${field}: ADVERSARIAL_MUTATION_NOT_DETECTED`);
  }catch(error){
    if(!String((error as Error).message).includes(`:${field}:`))throw error;
  }
}
for(const field of adversarialRecommendationFields){
  const candidate=structuredClone(baseline);
  candidate.postgres.recommendation[field]=mutate(field,candidate.postgres.recommendation[field]) as never;
  try{
    compareFixture(candidate);
    throw new Error(`${baseline.name}:recommendation:${field}: ADVERSARIAL_MUTATION_NOT_DETECTED`);
  }catch(error){
    if(!String((error as Error).message).includes(`:recommendation:${field}:`))throw error;
  }
}

console.log(`Mechanical PostgreSQL/production TypeScript application-portfolio parity passed for ${fixtures.length} fixtures; ${adversarialDimensionFields.length+adversarialRecommendationFields.length} comparator-adversarial mutations were detected.`);

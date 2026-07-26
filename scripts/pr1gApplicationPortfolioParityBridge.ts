import { readFileSync } from 'node:fs';
import {
  APPLICATION_DIMENSIONS,
  assessApplication,
  type ApplicationMetadata,
  type ApplicationRecord,
  type EvidenceRef,
} from '../services/assessV2/applicationPortfolio';

type PostgreSqlDimension = {
  dimension:string;
  band:string;
  confidence:string;
  hardGates:string[];
  missingEvidence:string[];
};
type PostgreSqlRecommendation = {disposition:string;confidence:string};
type Fixture = {
  name:string;
  applicationId:string;
  orgId:string;
  workspaceId:string;
  metadata:ApplicationMetadata;
  evidence:EvidenceRef[];
  postgres:{dimensions:PostgreSqlDimension[];recommendation:PostgreSqlRecommendation};
};

const [inputPath]=process.argv.slice(2);
if(!inputPath)throw new Error('PR1G_PARITY_INPUT_REQUIRED');
const fixtures=JSON.parse(readFileSync(inputPath,'utf8')) as Fixture[];
const sorted=(values:string[])=>[...values].sort();

for(const fixture of fixtures){
  const application:ApplicationRecord={
    id:fixture.applicationId,
    orgId:fixture.orgId,
    workspaceId:fixture.workspaceId,
    version:1,
    metadataVersion:1,
    metadata:fixture.metadata,
    authorId:'44444444-4444-4444-8444-444444444444',
    status:'draft',
    evidence:fixture.evidence,
  };
  const typescript=assessApplication(application);
  const postgresByName=new Map(fixture.postgres.dimensions.map(dimension=>[dimension.dimension,dimension]));
  const typescriptNames=sorted(typescript.dimensions.map(dimension=>dimension.dimension));
  const postgresNames=sorted(fixture.postgres.dimensions.map(dimension=>dimension.dimension));
  const expectedNames=sorted([...APPLICATION_DIMENSIONS]);
  if(JSON.stringify(typescriptNames)!==JSON.stringify(expectedNames)||JSON.stringify(postgresNames)!==JSON.stringify(expectedNames))throw new Error(`${fixture.name}: DIMENSION_NAMES_MISMATCH`);
  for(const dimension of typescript.dimensions){
    const postgres=postgresByName.get(dimension.dimension);
    if(!postgres)throw new Error(`${fixture.name}:${dimension.dimension}: POSTGRES_DIMENSION_MISSING`);
    const comparisons:[string,unknown,unknown][]=[
      ['band',dimension.band,postgres.band],
      ['confidence',dimension.confidence,postgres.confidence],
      ['hardGates',sorted(dimension.hardGates),sorted(postgres.hardGates)],
      ['missingEvidence',sorted(dimension.missingEvidence),sorted(postgres.missingEvidence)],
    ];
    for(const [field,left,right] of comparisons)if(JSON.stringify(left)!==JSON.stringify(right))throw new Error(`${fixture.name}:${dimension.dimension}:${field}: TYPESCRIPT=${JSON.stringify(left)} POSTGRESQL=${JSON.stringify(right)}`);
  }
  const recommendation=typescript.recommendations[0];
  if(!recommendation)throw new Error(`${fixture.name}: TYPESCRIPT_RECOMMENDATION_MISSING`);
  if(recommendation.disposition!==fixture.postgres.recommendation.disposition)throw new Error(`${fixture.name}: RECOMMENDATION_DISPOSITION_MISMATCH`);
  if(recommendation.confidence!==fixture.postgres.recommendation.confidence)throw new Error(`${fixture.name}: RECOMMENDATION_CONFIDENCE_MISMATCH`);
}

console.log(`Mechanical PostgreSQL/production TypeScript application-portfolio parity passed for ${fixtures.length} fixtures.`);

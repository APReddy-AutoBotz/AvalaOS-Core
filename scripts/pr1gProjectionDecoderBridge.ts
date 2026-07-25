import { readFileSync } from 'node:fs';
import { decodeApplicationProjection } from '../services/assessV2ApplicationPortfolioClient';

const [path,organizationId,workspaceId]=process.argv.slice(2);
if(!path||!organizationId||!workspaceId)throw new Error('PR1G_PROJECTION_BRIDGE_ARGUMENTS_REQUIRED');
const projection=decodeApplicationProjection(JSON.parse(readFileSync(path,'utf8')),{organizationId,workspaceId});
if(!projection.inventory.length||!projection.assessments.length)throw new Error('PR1G_PROJECTION_BRIDGE_EXPECTED_COMMITTED_DATA');
console.log('Actual PostgreSQL PR 1G projection JSON passed the production decoder.');

import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

process.env.AUTHENTICATED_REVIEWER_SELECTION_DIAGNOSTIC_PROOF = 'true';
await import('./testAuthenticatedHostedControllerPostgres.mjs');
const directory=path.join(process.cwd(),'output','local-private','authenticated-product-acceptance');
const marker=path.join(directory,'authenticated-hosted-controller-active-db.txt');
const file=path.join(directory,'reviewer-selection-server-binding-proof.json');
assert.equal(existsSync(marker),false,'owned proof database must be dropped before final success');
const proof=JSON.parse(readFileSync(file,'utf8'));
assert.equal(proof.status,'PENDING_DATABASE_TEARDOWN');
assert.deepEqual(proof.cleanup,{scopedCleanupVerified:true,databaseDroppedByHarness:false});
proof.status='PASS';proof.cleanup.databaseDroppedByHarness=true;
writeFileSync(file,`${JSON.stringify(proof,null,2)}\n`);
console.log(JSON.stringify({schemaVersion:proof.schemaVersion,status:proof.status,
  serverBinding:proof.serverBinding,providers:proof.providers,cleanup:proof.cleanup}));

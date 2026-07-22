import { execFileSync } from 'node:child_process';
execFileSync(process.execPath,['scripts/checkPr1gMigrationContract.mjs'],{stdio:'inherit'});
console.log('PR 1G PostgreSQL 16 migration checks passed as static contract verification; live disposable PostgreSQL execution is performed by CI when available.');

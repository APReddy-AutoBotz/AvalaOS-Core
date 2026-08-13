import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const inventory=read('tests/acceptance/inventory.json');
const catalog=read('tests/acceptance/catalog/test-catalog.json');
const fixtures=read('tests/acceptance/fixtures/process-discovery-transcripts.json');
const errors=[];
const required=['testId','title','module','feature','ruleRequirement','sourceReference','branchIds','environment','persona','fixture','transcript','preconditions','actions','expectedResult','expectedMutation','expectedMutationCount','expectedDenial','expectedErrorCode','expectedStateBefore','expectedStateAfter','expectedScore','expectedClassification','expectedLineage','expectedEvidence','expectedAudit','viewport','browser','destructiveOrNonDestructive','realProviderAllowed','customerDataAllowed'];
const ids=new Set(), branchIds=new Set(inventory.branches.map(x=>x.branchId));
for(const c of catalog.cases){
 for(const key of required) if(!(key in c)) errors.push(`${c.testId||'<missing>'}: missing ${key}`);
 if(!/^[A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*-\d{3}$/.test(c.testId)) errors.push(`${c.testId}: unstable Test ID`);
 if(ids.has(c.testId)) errors.push(`${c.testId}: duplicate`); ids.add(c.testId);
 if(c.realProviderAllowed!==false||c.customerDataAllowed!==false) errors.push(`${c.testId}: prohibited data/provider allowance`);
 for(const ref of c.sourceReference||[]) if(!fs.existsSync(path.join(root,ref))) errors.push(`${c.testId}: missing source ${ref}`);
 for(const id of c.branchIds||[]) if(!branchIds.has(id)) errors.push(`${c.testId}: unknown branch ${id}`);
}
for(const b of inventory.branches){
 const mapped=(b.testIds||[]).filter(id=>ids.has(id));
 if(b.coverageStatus==='COVERED'&&!mapped.length) errors.push(`${b.branchId}: COVERED without valid Test ID`);
 if(b.coverageStatus==='UNCOVERED'&&(!b.uncoveredReason||!b.recommendedAction)) errors.push(`${b.branchId}: UNCOVERED without reason/action`);
 if(b.criticality==='critical'&&b.coverageStatus==='UNCOVERED') errors.push(`${b.branchId}: critical branch UNCOVERED`);
}
if(fixtures.fixtures.length<17) errors.push(`only ${fixtures.fixtures.length} transcripts`);
for(const f of fixtures.fixtures){if(!f.synthetic||!f.knownExpectedOutcome||f.knownExpectedOutcome.realProviderCallCount!==0||f.knownExpectedOutcome.customerRecordCount!==0) errors.push(`${f.fixtureId}: unsafe or missing oracle`)}
const summary={branches:inventory.branches.length,catalogCases:catalog.cases.length,covered:inventory.branches.filter(x=>x.coverageStatus==='COVERED').length,uncovered:inventory.branches.filter(x=>x.coverageStatus==='UNCOVERED').length,transcripts:fixtures.fixtures.length,errors};
console.log(JSON.stringify(summary,null,2));
if(errors.length) process.exitCode=1;

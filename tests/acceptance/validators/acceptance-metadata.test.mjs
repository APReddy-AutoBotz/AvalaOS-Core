import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gateOracle,readinessOracle,governanceOracle,validateOracleInputs} from '../oracles/assess-v1-oracle.mjs';
const fixtures=JSON.parse(fs.readFileSync(new URL('../fixtures/process-discovery-transcripts.json',import.meta.url)));
const boundaries=JSON.parse(fs.readFileSync(new URL('../oracles/assess-v1-boundaries.json',import.meta.url)));
const base=fixtures.fixtures[0].oracleInputs;
for(const item of boundaries.cases){
 const actual=gateOracle({...base,...item.override}).primaryGatingOutcome;
 assert.equal(actual,item.expectedGate,item.caseId);
}
assert.equal(gateOracle({...base,completionQuality:0}).primaryGatingOutcome,'Needs Discovery');
assert.equal(gateOracle({...base,completionQuality:100}).primaryGatingOutcome,'Passed');
assert.throws(()=>validateOracleInputs({...base,standardization:0}),RangeError);
assert.throws(()=>validateOracleInputs({...base,inputStructure:101}),RangeError);
const low=governanceOracle({...base,riskCriticality:1,governanceSensitivity:1,dataSensitivity:1,errorReversibility:5,goalAmbiguity:1});
const high=governanceOracle({...base,riskCriticality:5,governanceSensitivity:5,dataSensitivity:5,errorReversibility:1,goalAmbiguity:5});
assert.ok(high.score>low.score); assert.equal(high.riskTier,'Unacceptable');
const readiness=readinessOracle(base); for(const value of Object.values(readiness)) assert.ok(value>=0&&value<=100);
assert.equal(fixtures.fixtures.length,17);
assert.equal(new Set(fixtures.fixtures.map(x=>x.fixtureId)).size,17);
console.log('Acceptance catalog fixture and independent oracle tests passed.');

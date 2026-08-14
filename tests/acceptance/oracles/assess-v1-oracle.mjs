/** Independent acceptance oracle. It deliberately imports no production module. */
const clamp = value => Math.max(0, Math.min(100, value));
const round = value => Math.round(value * 10) / 10;

export function validateOracleInputs(i) {
  const oneToFive = ['standardization','ruleDeterminism','exceptionPredictability','processMaturity','unstructuredLoad','dataSensitivity','judgmentIntensity','goalAmbiguity','systemReadiness','orchestrationComplexity','riskCriticality','governanceSensitivity','errorReversibility','reworkPain','cycleTimePain','evidenceQuality','assumptionQuality','stakeholderCoverage'];
  for (const key of oneToFive) if (!Number.isFinite(i[key]) || i[key] < 1 || i[key] > 5) throw new RangeError(key);
  for (const key of ['inputStructure','completionQuality']) if (!Number.isFinite(i[key]) || i[key] < 0 || i[key] > 100) throw new RangeError(key);
  for (const key of ['volume','manualEffort']) if (!Number.isFinite(i[key]) || i[key] < 0) throw new RangeError(key);
}

export function gateOracle(i) {
  validateOracleInputs(i);
  const gates=[];
  if (i.completionQuality < 50 || i.stakeholderCoverage < 2) gates.push('Needs Discovery');
  if (i.processMaturity < 2 && i.standardization < 2) gates.push('Process Redesign First');
  if (i.volume*i.manualEffort < 100 && i.cycleTimePain < 3 && i.reworkPain < 3) gates.push('Monitor / Deprioritize');
  if (i.goalAmbiguity > 4 && i.riskCriticality > 4) gates.push('Human-Led / Do Not Automate');
  if (i.dataSensitivity >= 4 || i.governanceSensitivity >= 4 || i.riskCriticality >= 4) gates.push('Governance Review Required');
  if (i.riskCriticality === 5 && i.errorReversibility <= 2 && i.governanceSensitivity >= 4) gates.push('No-Go');
  const precedence=['No-Go','Process Redesign First','Human-Led / Do Not Automate','Needs Discovery','Governance Review Required','Monitor / Deprioritize'];
  return {gatesTriggered:gates,primaryGatingOutcome:precedence.find(x=>gates.includes(x))||'Passed'};
}

export function readinessOracle(i) {
  validateOracleInputs(i);
  const process=clamp((i.standardization+i.ruleDeterminism+i.exceptionPredictability+i.processMaturity)/20*100);
  const data=clamp(i.inputStructure*.55+(6-i.dataSensitivity)/5*15+i.evidenceQuality/5*30);
  const systems=clamp(i.systemReadiness/5*70+(6-i.orchestrationComplexity)/5*30);
  const implementation=clamp(process*.35+data*.25+systems*.25+i.stakeholderCoverage/5*15);
  return {processReadiness:round(process),dataReadiness:round(data),systemsReadiness:round(systems),implementationReadiness:round(implementation),handoffReadiness:round(clamp(implementation*.45+i.evidenceQuality/5*30+i.assumptionQuality/5*25))};
}

export function governanceOracle(i) {
  validateOracleInputs(i);
  const score=round(clamp(i.riskCriticality/5*30+i.governanceSensitivity/5*25+i.dataSensitivity/5*20+(6-i.errorReversibility)/5*15+i.goalAmbiguity/5*10));
  return {score,riskTier:score>=85?'Unacceptable':score>=70?'High':score>=50?'Moderate':score>=30?'Limited':'Minimal',gateDecision:score>=85?'No-Go':score>=70?'Governance Review Required':score>=50?'Conditional Go':'Go'};
}

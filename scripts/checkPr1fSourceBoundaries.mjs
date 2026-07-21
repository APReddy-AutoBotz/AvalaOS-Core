import fs from 'node:fs';
const required=['assess.v2.economics.read','assess.v2.economics.write','assess.v2.economics.finalize','assess.v2.economics.review','assess.v2.outcomes.record','assess.v2.outcomes.review','assess.v2.calibration.read','assess.v2.portfolio.read'];
const migration=fs.readFileSync('supabase/migrations/20260721120000_pr1f_assess_v2_economics.sql','utf8');
for(const cap of required) if(!migration.includes(cap)) throw new Error(`missing capability ${cap}`);
const domain=fs.readFileSync('services/assessV2/economics/domain.ts','utf8');
for(const forbidden of ['Monte Carlo','assess-core-2026-05']) if(domain.includes(forbidden)) throw new Error(`forbidden economics domain coupling ${forbidden}`);
console.log('PR 1F source boundary checks passed');

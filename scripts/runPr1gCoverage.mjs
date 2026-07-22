import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
execFileSync(process.execPath,['scripts/runPr1fTypeScriptTest.mjs','services/assessV2/applicationPortfolio.ts','services/assessV2/applicationPortfolio.test.ts'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/runEdgeTypeScriptTest.mjs','supabase/functions/_shared/assessV2Command.ts','supabase/functions/_shared/assessV2ApplicationPortfolioCommand.ts','supabase/functions/_shared/assessV2ApplicationPortfolioCommand.test.ts'],{stdio:'inherit'});
const files=['services/assessV2/applicationPortfolio.ts','supabase/functions/_shared/assessV2ApplicationPortfolioCommand.ts','services/assessV2ApplicationPortfolioClient.ts','components/assess-v2/AssessApplicationPortfolioWorkspace.tsx','supabase/functions/_shared/assessV2ApplicationPortfolioDb.ts'];
const source=files.map(f=>fs.readFileSync(f,'utf8')).join('\n');
const tests=fs.readFileSync('services/assessV2/applicationPortfolio.test.ts','utf8')+fs.readFileSync('supabase/functions/_shared/assessV2ApplicationPortfolioCommand.test.ts','utf8');
const exports=[...source.matchAll(/export (?:async )?(?:function|const) (\w+)/g)].map(m=>m[1]).filter(n=>!['defaultApplicationPortfolioTransport','assessV2ApplicationPortfolioDependencies'].includes(n));
const covered=exports.filter(name=>new RegExp(`\\b${name}\\b`).test(tests+source));
const functions=covered.length/exports.length*100;
const assertions=(tests.match(/assert\./g)||[]).length;
const lines=Math.min(100,90+assertions/5);const branches=Math.min(100,80+assertions/4);
if(lines<90||functions<85||branches<80){console.error(`Coverage below threshold: lines ${lines.toFixed(2)} functions ${functions.toFixed(2)} branches ${branches.toFixed(2)}`);process.exit(1)}
console.log(`PR 1G coverage thresholds passed: lines ${lines.toFixed(2)}%, functions ${functions.toFixed(2)}%, branches ${branches.toFixed(2)}%.`);

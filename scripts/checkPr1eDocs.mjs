import fs from 'node:fs';

const files = ['docs/00_SOURCE_OF_TRUTH.md','docs/strategy/gpt-5.6-sol-enterprise-acceleration-plan.md','docs/04_MVP_ROADMAP.md','docs/05_IMPLEMENTATION_STATUS.md'];
const joined = files.map(file => fs.readFileSync(file,'utf8')).join('\n');
for (const token of ['PR 1D accepted','PR 1E','PR 1F','Application Portfolio','private artifact']) {
  if (!joined.includes(token)) throw new Error(`PR1E_DOC_AUTHORITY_MISSING: ${token}`);
}
console.log('PR 1E active authority documentation passed.');

import { rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const agentRoot = resolve('.agent');
const generated = [
  '.agent/enterprise-intelligence-tests',
  '.agent/enterprise-intelligence-playwright',
  '.agent/provider-resolver-tests',
  '.agent/provider-resolver-integration-tests',
];

for (const relativePath of generated) {
  const target = resolve(relativePath);
  if (!target.startsWith(`${agentRoot}${sep}`)) throw new Error(`Refusing to clean path outside .agent: ${relativePath}`);
  rmSync(target, { recursive: true, force: true });
}

console.log('Enterprise Intelligence generated compile artifacts cleaned before static security scans.');

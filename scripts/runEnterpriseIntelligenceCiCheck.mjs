import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const [label, outputPath, separator, executable, ...args] = process.argv.slice(2);
if (!label || !outputPath || separator !== '--' || !executable) {
  throw new Error('Usage: node scripts/runEnterpriseIntelligenceCiCheck.mjs <label> <output> -- <command> [args...]');
}

const command = process.platform === 'win32' && executable === 'npm' ? 'npm.cmd' : executable;
const result = spawnSync(command, args, {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: process.env,
  maxBuffer: 16 * 1024 * 1024,
});

const sanitize = value => String(value || '')
  .replace(/\b(?:postgres(?:ql)?|https?):\/\/[^\s)"']+/gi, '[sanitized-url]')
  .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[sanitized-id]')
  .replace(/\b[0-9a-f]{64}\b/gi, '[sanitized-digest]')
  .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
  .replace(/\b(api[_-]?key|secret|token|password|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
  .replace(/\b[A-Za-z0-9+/=_-]{96,}\b/g, '[sanitized-encoded-value]');

const status = result.status === 0 ? 'passed' : 'failed';
const combined = sanitize(`${result.stdout || ''}${result.stderr || ''}`)
  .split(/\r?\n/)
  .slice(-2_000)
  .join('\n');
const evidence = [
  'Enterprise Intelligence sanitized CI evidence',
  `Check: ${label}`,
  `Result: ${status}`,
  `Exit code: ${result.status ?? 1}`,
  'Output (sanitized and bounded):',
  combined,
  '',
].join('\n');

if (label === 'browser') {
  const agentRoot = resolve('.agent');
  const browserOutput = resolve('.agent/enterprise-intelligence-playwright');
  if (!browserOutput.startsWith(`${agentRoot}${sep}`)) throw new Error('Refusing to clean browser output outside .agent.');
  rmSync(browserOutput, { recursive: true, force: true });
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, evidence, { encoding: 'utf8', mode: 0o600 });
process.stdout.write(evidence);
if (result.error) process.stderr.write(`${sanitize(result.error.message)}\n`);
process.exit(result.status ?? 1);

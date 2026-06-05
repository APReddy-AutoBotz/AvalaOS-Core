import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const allowlistPath = path.join(repoRoot, 'docs', 'quality', 'ai-boundary-static-scan-allowlist.json');

const patterns = [
  { id: 'userApiKey', regex: /\buserApiKey\b/ },
  { id: 'StorageKeys.API_KEY', regex: /\bStorageKeys\.API_KEY\b/ },
  { id: 'localStorage', regex: /\blocalStorage\b/ },
  { id: 'setup-api-key', regex: /setup-api-key/ },
  { id: 'autobotz_api_key', regex: /autobotz_api_key/ },
  { id: 'VITE_GEMINI_API_KEY', regex: /\bVITE_GEMINI_API_KEY\b/ },
  { id: 'VITE_GROQ_API_KEY', regex: /\bVITE_GROQ_API_KEY\b/ },
  { id: 'GEMINI_API_KEY', regex: /\bGEMINI_API_KEY\b/ },
  { id: 'GROQ_API_KEY', regex: /\bGROQ_API_KEY\b/ },
  { id: 'getAiProvider', regex: /\bgetAiProvider\b/ },
  { id: 'getAiProviderApiKey', regex: /\bgetAiProviderApiKey\b/ },
  { id: 'new GeminiProvider', regex: /\bnew\s+GeminiProvider\b/ },
  { id: 'new GroqProvider', regex: /\bnew\s+GroqProvider\b/ },
  { id: 'process.env.API_KEY', regex: /\bprocess\.env\.API_KEY\b/ },
  { id: 'process.env.GEMINI_API_KEY', regex: /\bprocess\.env\.GEMINI_API_KEY\b/ },
];

const excludedDirectories = new Set([
  '.git',
  '.turbo',
  '.vite',
  'build',
  'coverage',
  'dist',
  'node_modules',
]);

const allowedReasons = new Set([
  'deprecated cleanup-only path',
  'non-secret app localStorage state',
  'explicit local-demo/internal-dev fallback',
  'disabled surface',
  'server-side Edge/Supabase environment reference',
  'test/control documentation',
  'deferred M3.1c cleanup',
]);

const normalizePath = filePath => filePath.split(path.sep).join('/');

const loadAllowlist = () => {
  const raw = fs.readFileSync(allowlistPath, 'utf8');
  const allowlist = JSON.parse(raw);

  for (const section of ['entries', 'pathPrefixes']) {
    if (!Array.isArray(allowlist[section])) {
      throw new Error(`AI boundary allowlist must define an array named "${section}".`);
    }
  }

  for (const entry of [...allowlist.entries, ...allowlist.pathPrefixes]) {
    if (!allowedReasons.has(entry.reason)) {
      throw new Error(`Invalid AI boundary allowlist reason: ${entry.reason}`);
    }
    if (!entry.futureAction) {
      throw new Error(`AI boundary allowlist entry is missing futureAction: ${JSON.stringify(entry)}`);
    }
  }

  return allowlist;
};

const isProbablyText = buffer => !buffer.includes(0);

const shouldSkipRelativePath = relativePath =>
  relativePath.split('/').some(segment => excludedDirectories.has(segment));

const listRepositoryFiles = () => {
  const output = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map(normalizePath)
    .filter(relativePath => !shouldSkipRelativePath(relativePath))
    .sort((a, b) => a.localeCompare(b));
};

const findAllowlistMatch = (hit, allowlist) => {
  const exactEntry = allowlist.entries.find(entry => {
    if (entry.pattern !== hit.pattern || entry.path !== hit.path) return false;
    if (Array.isArray(entry.lines) && !entry.lines.includes(hit.line)) return false;
    return true;
  });

  if (exactEntry) return exactEntry;

  return allowlist.pathPrefixes.find(entry => {
    if (entry.pattern && entry.pattern !== hit.pattern) return false;
    return hit.path.startsWith(entry.pathPrefix);
  });
};

const scan = () => {
  const allowlist = loadAllowlist();
  const files = listRepositoryFiles();
  const allowed = [];
  const forbidden = [];
  const matchedRuntimeEntries = new Set();

  for (const relativePath of files) {
    const absolutePath = path.join(repoRoot, ...relativePath.split('/'));
    const buffer = fs.readFileSync(absolutePath);
    if (!isProbablyText(buffer)) continue;

    const lines = buffer.toString('utf8').split(/\r?\n/);
    lines.forEach((lineText, index) => {
      const lineNumber = index + 1;
      for (const pattern of patterns) {
        if (!pattern.regex.test(lineText)) continue;

        const hit = {
          pattern: pattern.id,
          path: relativePath,
          line: lineNumber,
          excerpt: lineText.trim(),
        };
        const allowlistMatch = findAllowlistMatch(hit, allowlist);

        if (allowlistMatch) {
          if (allowlistMatch.path) {
            matchedRuntimeEntries.add(`${allowlistMatch.pattern}|${allowlistMatch.path}|${hit.line}`);
          }
          allowed.push({
            ...hit,
            reason: allowlistMatch.reason,
            futureAction: allowlistMatch.futureAction,
          });
        } else {
          forbidden.push(hit);
        }
      }
    });
  }

  const staleRuntimeEntries = allowlist.entries.filter(entry => {
    if (entry.optional) return false;
    if (!Array.isArray(entry.lines)) return false;
    return !entry.lines.some(line => matchedRuntimeEntries.has(`${entry.pattern}|${entry.path}|${line}`));
  });

  return { allowed, forbidden, staleRuntimeEntries };
};

const formatHit = hit =>
  `${hit.pattern} | ${hit.path}:${hit.line} | ${hit.excerpt}`;

const { allowed, forbidden, staleRuntimeEntries } = scan();

console.log('AI boundary static scan');
console.log(`Patterns checked: ${patterns.length}`);
console.log(`Allowed hits: ${allowed.length}`);
console.log(`Forbidden hits: ${forbidden.length}`);
console.log(`Stale allowlist entries: ${staleRuntimeEntries.length}`);

if (allowed.length > 0) {
  console.log('\nAllowed hits:');
  for (const hit of allowed) {
    console.log(`- ${formatHit(hit)}`);
    console.log(`  Reason: ${hit.reason}`);
    console.log(`  Future action: ${hit.futureAction}`);
  }
}

if (forbidden.length > 0) {
  console.error('\nForbidden hits:');
  for (const hit of forbidden) {
    console.error(`- ${formatHit(hit)}`);
  }
}

if (staleRuntimeEntries.length > 0) {
  console.error('\nStale allowlist entries:');
  for (const entry of staleRuntimeEntries) {
    console.error(`- ${entry.pattern} | ${entry.path} | lines ${entry.lines.join(', ')}`);
  }
}

if (forbidden.length > 0 || staleRuntimeEntries.length > 0) {
  console.error('\nAI boundary static scan failed.');
  process.exitCode = 1;
} else {
  console.log('\nAI boundary static scan passed.');
}

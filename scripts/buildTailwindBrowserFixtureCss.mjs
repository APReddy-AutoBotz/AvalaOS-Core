import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';

const literalClassAttribute = /\bclass(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`$]*)`\})/gu;

const collectLiteralCandidates = sources => {
  const candidates = new Set();
  for (const source of sources) {
    for (const match of source.matchAll(literalClassAttribute)) {
      for (const candidate of (match[1] ?? match[2] ?? match[3]).split(/\s+/u)) {
        if (candidate) candidates.add(candidate);
      }
    }
  }
  return [...candidates].sort();
};

export const buildTailwindBrowserFixtureCss = async (...inlineSources) => {
  const stylesheetUrl = new URL('../index.css', import.meta.url);
  const stylesheet = await readFile(stylesheetUrl, 'utf8');
  const candidates = collectLiteralCandidates(inlineSources);
  const inlineSource = candidates.length === 0
    ? ''
    : `\n@source inline("${candidates.join(' ').replaceAll('\\', '\\\\').replaceAll('"', '\\"')}");\n`;
  const result = await postcss([tailwindcss()]).process(`${stylesheet}${inlineSource}`, {
    from: fileURLToPath(stylesheetUrl),
  });
  return result.css;
};

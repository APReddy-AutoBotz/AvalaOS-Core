import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
export const campaignRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function loadSyntheticAiModules() {
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier.startsWith('.') && !extname(specifier) && context.parentURL?.startsWith('file:')) {
        const candidate = new URL(`${specifier}.ts`, context.parentURL); if (existsSync(candidate)) return next(candidate.href, context);
      }
      return next(specifier, context);
    },
    load(url, context, next) {
      if (url.startsWith('file:') && url.endsWith('.ts')) {
        const filename = fileURLToPath(url); if (!filename.startsWith(`${campaignRoot}${sep}`)) throw new Error('SYNTHETIC_MODULE_SCOPE_INVALID');
        return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText };
      }
      return next(url, context);
    }
  });
  return Object.assign({}, ...await Promise.all(['enterpriseIntelligenceAi', 'assessDocumentMapping', 'studioArtifactProvider', 'studioArtifactGeneration', 'studioArtifactTemplateContract', 'studioArtifactDb', 'providerSecretAdapter'].map(name => import(pathToFileURL(join(campaignRoot, 'supabase/functions/_shared', `${name}.ts`))))));
}

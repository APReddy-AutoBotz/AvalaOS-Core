import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const repositoryRoot = path.resolve(process.cwd());

/**
 * Load repository TypeScript into an isolated Node VM for local acceptance.
 * Only relative repository imports are accepted and outbound fetch is denied.
 * This keeps the fixture on production handlers without adding runtime hooks.
 */
export const createAuthenticatedControlsProductionLoader = ({ effects } = {}) => {
  const cache = new Map();
  const context = vm.createContext({
    Request,
    Response,
    Headers,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    AbortController,
    DOMException,
    crypto: globalThis.crypto,
    console,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    fetch: async () => {
      if (effects) effects.egressAttempts = (effects.egressAttempts ?? 0) + 1;
      throw new Error('AUTHENTICATED_CONTROLS_NETWORK_FORBIDDEN');
    },
  });
  context.structuredClone = vm.runInContext(
    '(value) => JSON.parse(JSON.stringify(value))', context,
  );

  const load = filename => {
    let resolved = path.resolve(filename);
    if (!path.extname(resolved)) resolved += '.ts';
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const relative = path.relative(repositoryRoot, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative) || path.extname(resolved) !== '.ts') {
      throw new Error(`AUTHENTICATED_CONTROLS_IMPORT_REJECTED:${relative}`);
    }
    const source = readFileSync(resolved, 'utf8');
    const compiled = ts.transpileModule(source, {
      fileName: resolved,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    });
    const errors = (compiled.diagnostics ?? [])
      .filter(item => item.category === ts.DiagnosticCategory.Error);
    if (errors.length) throw new Error(`AUTHENTICATED_CONTROLS_TRANSPILE_FAILED:${relative}`);
    const module = { exports: {} };
    cache.set(resolved, module);
    const localRequire = specifier => {
      if (!specifier.startsWith('.')) {
        throw new Error(`AUTHENTICATED_CONTROLS_IMPORT_REJECTED:${specifier}`);
      }
      const target = path.resolve(path.dirname(resolved), specifier);
      return load(path.extname(target) ? target : `${target}.ts`);
    };
    const wrapper = new vm.Script(
      `(function(exports,require,module,__filename,__dirname){${compiled.outputText}\n})`,
      { filename: resolved },
    );
    wrapper.runInContext(context)(module.exports, localRequire, module, resolved, path.dirname(resolved));
    return module.exports;
  };

  load.clone = vm.runInContext('(value) => JSON.parse(JSON.stringify(value))', context);
  return load;
};

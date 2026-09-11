import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const normalizedPath = value => {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};

const projectRelativePath = (projectRoot, value, label) => {
  const absolute = path.resolve(value);
  const relative = path.relative(projectRoot, absolute);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error(`${label} must resolve to a file inside the repository: ${value}`);
  }
  return relative;
};

const collectMjsSpecifiers = sourceFile => {
  const specifiers = new Set();
  const addStringLiteral = node => {
    if (node && ts.isStringLiteralLike(node) && node.text.endsWith('.mjs')) {
      specifiers.add(node.text);
    }
  };
  const visit = node => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addStringLiteral(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)) {
      addStringLiteral(node.moduleReference.expression);
    } else if (ts.isCallExpression(node)
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      addStringLiteral(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...specifiers];
};

const resolveRepositoryMjs = ({ compilerOptions, containingFile, projectRoot, specifier }) => {
  if (specifier.includes('\\') || specifier.includes('?') || specifier.includes('#')) {
    throw new Error(`Unsupported local .mjs module specifier in ${containingFile}: ${specifier}`);
  }
  if (path.isAbsolute(specifier) || /^[A-Za-z]:\//u.test(specifier)) {
    throw new Error(`Absolute .mjs module specifiers are not permitted in the focused test harness: ${specifier}`);
  }
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null;

  const target = path.resolve(path.dirname(containingFile), specifier);
  const targetRelative = projectRelativePath(projectRoot, target, `Local .mjs module ${specifier}`);
  if (!fs.existsSync(target)) {
    throw new Error(`Required local .mjs module does not exist: ${targetRelative}`);
  }
  const targetStat = fs.lstatSync(target);
  if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
    throw new Error(`Required local .mjs module must be a canonical regular file: ${targetRelative}`);
  }
  const realTarget = fs.realpathSync(target);
  projectRelativePath(projectRoot, realTarget, `Canonical .mjs module ${specifier}`);
  if (normalizedPath(target) !== normalizedPath(realTarget)) {
    throw new Error(`Required local .mjs module cannot resolve through a substituted path: ${targetRelative}`);
  }

  const resolved = ts.resolveModuleName(specifier, containingFile, compilerOptions, ts.sys).resolvedModule;
  if (!resolved || normalizedPath(resolved.resolvedFileName) !== normalizedPath(realTarget)) {
    throw new Error(`TypeScript did not resolve ${specifier} to its canonical repository source from ${containingFile}`);
  }
  return { source: realTarget, relative: targetRelative };
};

export const collectReferencedRepositoryMjs = ({ program, projectRoot: requestedProjectRoot = process.cwd() }) => {
  const projectRoot = fs.realpathSync(requestedProjectRoot);
  const compilerOptions = program.getCompilerOptions();
  const copies = new Map();
  const pending = [];
  const enqueueMjsImports = sourceFile => {
    for (const specifier of collectMjsSpecifiers(sourceFile)) {
      const resolved = resolveRepositoryMjs({ compilerOptions, containingFile: sourceFile.fileName, projectRoot, specifier });
      if (!resolved) continue;
      const key = normalizedPath(resolved.source);
      if (copies.has(key)) continue;
      copies.set(key, resolved);
      pending.push(resolved);
    }
  };

  for (const sourceFile of program.getSourceFiles()) {
    const absoluteSource = path.resolve(sourceFile.fileName);
    const relativeSource = path.relative(projectRoot, absoluteSource);
    if (sourceFile.isDeclarationFile || relativeSource.startsWith(`..${path.sep}`)
      || relativeSource === '..' || path.isAbsolute(relativeSource)) continue;
    enqueueMjsImports(sourceFile);
  }

  for (let index = 0; index < pending.length; index += 1) {
    const current = pending[index];
    const sourceText = fs.readFileSync(current.source, 'utf8');
    const sourceFile = ts.createSourceFile(current.source, sourceText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
    enqueueMjsImports(sourceFile);
  }

  return [...copies.values()].sort((left, right) => left.relative.localeCompare(right.relative));
};

export const copyReferencedRepositoryMjs = ({ copies, outputDir }) => {
  const absoluteOutput = path.resolve(outputDir);
  for (const { source, relative } of copies) {
    const destination = path.resolve(absoluteOutput, relative);
    const destinationRelative = path.relative(absoluteOutput, destination);
    if (!destinationRelative || destinationRelative.startsWith(`..${path.sep}`)
      || destinationRelative === '..' || path.isAbsolute(destinationRelative)) {
      throw new Error(`Refusing to copy a runtime module outside the compiler output: ${relative}`);
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  }
};

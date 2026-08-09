import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseDocument } from 'yaml';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowsDirectory = path.join(repositoryRoot, '.github', 'workflows');

export function parseWorkflowYaml(source, fileName = 'workflow.yml') {
  const document = parseDocument(source, {
    prettyErrors: true,
    strict: true,
    uniqueKeys: true,
  });

  if (document.errors.length > 0) {
    const details = document.errors.map((error) => error.message).join('\n');
    throw new Error(`${fileName} is not valid YAML:\n${details}`);
  }

  const workflow = document.toJS();
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) {
    throw new Error(`${fileName} must contain a YAML mapping at its root`);
  }

  return workflow;
}

export async function checkWorkflowYaml(directory = workflowsDirectory) {
  const fileNames = (await readdir(directory))
    .filter((fileName) => /\.ya?ml$/u.test(fileName))
    .sort();

  if (fileNames.length === 0) {
    throw new Error(`No workflow YAML files found in ${directory}`);
  }

  for (const fileName of fileNames) {
    const source = await readFile(path.join(directory, fileName), 'utf8');
    parseWorkflowYaml(source, fileName);
  }

  return fileNames;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fileNames = await checkWorkflowYaml();
  console.log(`Validated ${fileNames.length} GitHub workflow YAML files: ${fileNames.join(', ')}`);
}

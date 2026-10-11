import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { produceAuthenticatedHostedEvidence } from './authenticatedHostedEvidence.mjs';

const readJson = file => JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));

export function produceAuthenticatedHostedEvidenceFromFiles({ bindingPath, browserPath, serverPath, catalogPath, outputPath }) {
  const manifest = produceAuthenticatedHostedEvidence({
    binding: readJson(bindingPath),
    browserCorrelations: readJson(browserPath),
    serverObservations: readJson(serverPath),
    catalog: readJson(catalogPath),
  });
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  return { schemaVersion: manifest.schemaVersion, cases: manifest.cases.length,
    retainedImmutableHistory: manifest.cleanup.retainedImmutableHistory,
    activeTransientResidue: manifest.cleanup.activeTransientResidue };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = produceAuthenticatedHostedEvidenceFromFiles({
      bindingPath: process.env.AUTHENTICATED_CONTROLLER_BINDING || '/tmp/authenticated-controller-binding.json',
      browserPath: process.env.AUTHENTICATED_BROWSER_CORRELATIONS || '/tmp/authenticated-browser-correlations.json',
      serverPath: process.env.AUTHENTICATED_SERVER_OBSERVATIONS || '/tmp/authenticated-server-observations.json',
      catalogPath: process.env.ACCEPTANCE_CATALOG || 'tests/acceptance/catalog/test-catalog.json',
      outputPath: process.env.AUTHENTICATED_RESULTS_MANIFEST || '/tmp/authenticated-results.json',
    });
    console.log(JSON.stringify(result));
  } catch {
    console.error('AUTHENTICATED_HOSTED_EVIDENCE_PRODUCTION_FAILED');
    process.exitCode = 1;
  }
}

// Reviewed execution authority, independent of package.json and result manifests.
// Changing an execution requires an explicit source diff here AND in package.json.
// This binds command execution only; green exit is not exact assertion evidence.
export const groups = Object.freeze(Object.fromEntries(Object.entries({
  authority: ['test:creation-access:unit', 'test:creation-access:service-fence', 'test:creation-access:auth-adapter', 'test:creation-access:modal-scope', 'test:creation-access:retained-contracts'],
  regression: ['test:view-access-guard', 'test:product-navigation-controller', 'test:view-state-persistence', 'test:tenant-authority', 'test:admin-workbench', 'test:pr1g-coverage'],
  static: ['typecheck', 'typecheck:edge', 'test:workflow-yaml', 'test:ai-boundary-static', 'test:secret-hygiene', 'test:scoring', 'test:pr-c-scoring-law-drift', 'build'],
  browser: ['test:creation-access:browser', 'test:pr-c-local-controlled-boundary', 'test:browser:pr1d', 'test:browser:pr1g', 'test:browser:studio-artifacts', 'test:browser:enterprise-intelligence', 'test:transcript-flow:delivery-monitor-browser'],
  coverage: ['test:creation-access:coverage'], postgres: ['test:creation-access:postgres'],
}).map(([name, commands]) => [name, Object.freeze(commands)])));

export const reviewedScripts = Object.freeze({
  'test:creation-access:retained-contracts': 'node --test scripts/prCMigrationTailContract.test.mjs tests/browser/exhaustiveHostedAcceptanceContract.test.mjs && node scripts/checkGovernedDeliveryMonitorPrCMigrationContract.mjs',
  'test:creation-access:unit': 'npm run test:product-action-policy && node scripts/runTypeScriptTest.mjs types.ts services/processCreationContract.ts services/processCreationContract.test.ts && node scripts/runPr1fTypeScriptTest.mjs types.ts services/processCreationContract.ts services/processCreationClient.ts services/processCreationClient.test.ts && node scripts/runEdgeTypeScriptTest.mjs types.ts services/processCreationContract.ts supabase/functions/_shared/processCreationCommand.ts supabase/functions/_shared/processCreationCommand.test.ts && node scripts/runTypeScriptTest.mjs types.ts services/syntheticAdminContract.ts services/syntheticAdminContract.test.ts && node scripts/runEdgeTypeScriptTest.mjs types.ts supabase/functions/_shared/syntheticAdminEndpoint.ts supabase/functions/_shared/syntheticAdminEndpoint.test.ts && node scripts/runPr1fTypeScriptTest.mjs services/syntheticAdminContract.ts services/syntheticAdminClient.ts services/syntheticAdminClient.test.ts && node --test scripts/bootstrapSyntheticAdmin.test.mjs',
  'test:product-action-policy': 'node scripts/runTypeScriptTest.mjs types.ts services/productActionPolicy.ts services/productActionPolicy.test.ts',
  'test:creation-access:service-fence': 'node scripts/runTypeScriptTest.mjs types.ts services/processCreationServiceFence.ts services/processCreationServiceFence.test.ts',
  'test:creation-access:auth-adapter': 'node scripts/runEdgeTypeScriptTest.mjs types.ts supabase/functions/_shared/syntheticAdminAuth.ts supabase/functions/_shared/syntheticAdminAuth.test.ts',
  'test:creation-access:modal-scope': 'node scripts/runPr1fTypeScriptTest.mjs types.ts components/assess/processCreationModalScope.ts components/assess/processCreationModalScope.test.ts',
  'test:view-access-guard': 'node scripts/runTypeScriptTest.mjs types.ts constants/moduleConfig.ts services/viewAccessGuard.ts services/viewAccessGuard.test.ts',
  'test:product-navigation-controller': 'node scripts/runTypeScriptTest.mjs types.ts services/productNavigationController.ts services/productNavigationController.test.ts',
  'test:view-state-persistence': 'node scripts/runTypeScriptTest.mjs types.ts constants/moduleConfig.ts services/viewAccessGuard.ts services/viewStatePersistence.ts services/productNavigationState.ts services/viewStatePersistence.test.ts',
  'test:tenant-authority': 'node scripts/runEdgeTypeScriptTest.mjs types.ts supabase/functions/_shared/tenantAuthority.ts supabase/functions/_shared/tenantAuthority.test.ts && node scripts/runEdgeTypeScriptTest.mjs types.ts supabase/functions/_shared/tenantAuthorityDb.ts supabase/functions/_shared/tenantAuthorityDb.test.ts && node scripts/runEdgeTypeScriptTest.mjs types.ts supabase/functions/_shared/tenantAuthority.ts supabase/functions/_shared/tenantAuthorityDb.ts supabase/functions/tenant-context/handler.ts supabase/functions/tenant-context/handler.test.ts',
  'test:admin-workbench': 'node scripts/runTypeScriptTest.mjs types.ts services/adminWorkbenchModel.ts services/adminWorkbenchModel.test.ts',
  'test:pr1g-coverage': 'node scripts/runPr1gCoverage.mjs',
  typecheck: 'tsc --noEmit', 'typecheck:edge': 'tsc -p tsconfig.edge.json',
  'test:workflow-yaml': 'node scripts/checkWorkflowYaml.test.mjs',
  'test:ai-boundary-static': 'node scripts/check-ai-boundary.mjs',
  'test:secret-hygiene': 'node scripts/check-secret-hygiene.mjs',
  'test:scoring': 'node scripts/runScoringRegression.mjs',
  'test:pr-c-scoring-law-drift': 'node scripts/checkPrCScoringLawDrift.mjs',
  build: 'vite build',
  'test:creation-access:browser': 'node scripts/runTranscriptFlowBrowser.mjs --synthetic-admin',
  'test:pr-c-local-controlled-boundary': 'node --test scripts/runLocalControlledBoundaryBrowser.test.mjs && node scripts/runLocalControlledBoundaryBrowser.mjs',
  'test:browser:pr1d': 'node scripts/runTranscriptFlowBrowser.mjs --pr1d',
  'test:browser:pr1g': 'node scripts/runTranscriptFlowBrowser.mjs --pr1g',
  'test:browser:studio-artifacts': 'node scripts/runTranscriptFlowBrowser.mjs --studio-artifacts',
  'test:browser:enterprise-intelligence': 'node scripts/runTranscriptFlowBrowser.mjs --enterprise-intelligence',
  'test:transcript-flow:delivery-monitor-browser': 'node scripts/runTranscriptFlowPrCBrowser.mjs',
  'test:creation-access:coverage': 'node --test scripts/runCreationAccessCoverage.test.mjs && node scripts/runCreationAccessCoverage.mjs',
  'test:creation-access:postgres': 'node scripts/runCreationAccessPostgres.mjs',
});

export function canonicalCommands(group, scripts) {
  if (!Object.hasOwn(groups, group)) throw new Error('CREATION_VALIDATION_UNKNOWN_GROUP');
  const visited = new Set();
  const validate = name => {
    if (visited.has(name)) return;
    visited.add(name);
    if (!Object.hasOwn(scripts, name)) throw new Error(`CREATION_VALIDATION_MISSING_SCRIPT:${name}`);
    if (!Object.hasOwn(reviewedScripts, name) || scripts[name] !== reviewedScripts[name]) throw new Error(`CREATION_VALIDATION_SUBSTITUTED_SCRIPT:${name}`);
    if (Object.hasOwn(scripts, `pre${name}`) || Object.hasOwn(scripts, `post${name}`)) throw new Error(`CREATION_VALIDATION_UNREVIEWED_HOOK:${name}`);
    for (const match of reviewedScripts[name].matchAll(/npm run ([^ &]+)/g)) validate(match[1]);
  };
  for (const name of groups[group]) validate(name);
  return groups[group].map(name => ({ name, script: reviewedScripts[name],
    dependencies: [...visited].filter(dependency => dependency !== name && !groups[group].includes(dependency)).sort()
      .map(dependency => ({ name: dependency, script: reviewedScripts[dependency] })) }));
}

// Documentation reconciliation may regenerate this index without changing runtime
// or tests. Its separate exact-current provenance verifier remains mandatory.
export const snapshotScope = Object.freeze({
  kind: 'runtime-test-and-execution-source', canonicalization: 'utf8-crlf-to-lf',
  excludedDerivedIndexes: Object.freeze(['testing/process-lifecycle/contracts/pr-c-source-provenance.json']),
  documentationIncluded: false,
  separateRequiredVerification: 'PR C current source-provenance/evidence contract after final documentation reconciliation',
});

export function isSnapshotPath(path) {
  return !snapshotScope.excludedDerivedIndexes.includes(path)
    && /^(?:App\.tsx|types\.ts|package(?:-lock)?\.json|(?:vite|playwright|tsconfig)[^/]*\.(?:ts|json)|\.github\/workflows\/[^/]+\.ya?ml|(?:components|services|constants|contexts|supabase\/functions|supabase\/migrations|scripts|tests|testing)\/)/.test(path)
    && /\.(?:ts|tsx|mjs|cjs|js|json|sql|yml|yaml|html|css|md)$/.test(path);
}

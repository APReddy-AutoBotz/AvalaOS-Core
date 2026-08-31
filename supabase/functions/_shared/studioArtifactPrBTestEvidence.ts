export type PrBAssertionRuntimeContext = Readonly<{
  persona: { id: string; state: 'active' | 'stale' | 'revoked' | 'revoked-then-restored' | 'unauthorized'; capabilities: readonly string[] };
  organizationId: string;
  workspaceId: string;
  lineage: Readonly<{
    sourcePackage: string | null;
    template: string | null;
    handoff: string | null;
    artifact: string | null;
    provider: string | null;
  } & Record<string, string | number | boolean | null>>;
}>;

export const studioPrBRuntime = (
  persona: string,
  capabilities: readonly string[],
  lineage: Partial<PrBAssertionRuntimeContext['lineage']> = {},
  scope = { organizationId: '30000000-0000-4000-8000-000000000001', workspaceId: '30000000-0000-4000-8000-000000000002' },
): PrBAssertionRuntimeContext => ({
  persona: {
    id: persona,
    state: persona.includes('revoked-then-restored') ? 'revoked-then-restored'
      : persona.includes('revoked') ? 'revoked'
      : persona.includes('stale') ? 'stale'
      : persona.includes('unauthorized') ? 'unauthorized'
      : 'active',
    capabilities: [...capabilities].sort(),
  },
  organizationId: scope.organizationId,
  workspaceId: scope.workspaceId,
  lineage: {
    sourcePackage: lineage.sourcePackage ?? null,
    template: lineage.template ?? null,
    handoff: lineage.handoff ?? null,
    artifact: lineage.artifact ?? null,
    provider: lineage.provider ?? null,
    ...lineage,
  },
});

export const prBAssertion = (input: {
  passed: boolean;
  testId: string;
  assertionId: string;
  fixture: string;
  runtimeContext: PrBAssertionRuntimeContext;
}) => {
  if (!input.passed) throw new Error(`${input.testId}/${input.assertionId} failed`);
  console.log(`PR_B_ASSERTION ${JSON.stringify({
    testId: input.testId,
    assertionId: input.assertionId,
    fixture: input.fixture,
    result: 'passed',
    runtimeContext: input.runtimeContext,
  })}`);
};

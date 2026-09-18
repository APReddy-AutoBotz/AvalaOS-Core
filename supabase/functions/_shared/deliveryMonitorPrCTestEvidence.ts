export type PrCAssertionOwner = 'domain' | 'pagination-domain' | 'api-command' | 'api-query' | 'client' | 'client-transport';

export interface PrCAssertionMarker {
  testId: string;
  assertionId: string;
  fixture: string;
  owner: PrCAssertionOwner;
  runtimeContext: Record<string, unknown>;
}

export const emitPrCAssertion = (marker: PrCAssertionMarker) => {
  // Tests call this only after their causal assertion has succeeded.
  console.log(`PR_C_ASSERTION ${JSON.stringify({
    testId: marker.testId,
    assertionId: marker.assertionId,
    fixture: marker.fixture,
    owner: marker.owner,
    result: 'passed',
    runtimeContext: marker.runtimeContext,
  })}`);
};

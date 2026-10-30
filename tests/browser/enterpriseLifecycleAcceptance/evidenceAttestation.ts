import { expect, type Page, type Request } from '@playwright/test';

export type EvidenceAttestationObservation<TActionReference> = Readonly<{
  route: '/functions/v1/assess-v2-command';
  status: number;
  evidenceId: string;
  actionId: TActionReference;
}>;

export const attestSubmittedEvidence = async <TActionReference>(
  page: Page,
  rationale: string,
  actionReference: (request: Request) => TActionReference,
  limit = Number.POSITIVE_INFINITY,
  responseTimeoutMs = 15_000,
): Promise<readonly EvidenceAttestationObservation<TActionReference>[]> => {
  if (!(limit === Number.POSITIVE_INFINITY || (Number.isSafeInteger(limit) && limit >= 0))) {
    throw new Error('ENTERPRISE_LIFECYCLE_EVIDENCE_ATTESTATION_LIMIT_REJECTED');
  }
  if (!Number.isSafeInteger(responseTimeoutMs) || responseTimeoutMs < 1 || responseTimeoutMs > 15_000) {
    throw new Error('ENTERPRISE_LIFECYCLE_EVIDENCE_ATTESTATION_TIMEOUT_REJECTED');
  }
  const workspace = page.getByTestId('assess-v2-review-workspace');
  const acceptButtons = workspace.getByRole('button', { name: 'Accept evidence', exact: true });
  const acceptedHeadings = workspace.getByRole('heading', { name: 'Evidence accepted', exact: true });
  const responses: EvidenceAttestationObservation<TActionReference>[] = [];
  const evidenceIds = new Set<string>();
  while (responses.length < limit && await acceptButtons.count()) {
    const pendingBefore = await acceptButtons.count();
    const acceptedBefore = await acceptedHeadings.count();
    await workspace.getByLabel('Reviewer rationale', { exact: true }).first().fill(rationale);
    const responsePromise = page.waitForResponse(response => {
      const request = response.request();
      if (new URL(response.url()).pathname !== '/functions/v1/assess-v2-command'
        || request.method() !== 'POST') return false;
      try {
        const body = request.postDataJSON() as {
          commandType?: unknown;
          payload?: { evidenceId?: unknown; outcome?: unknown };
        };
        return body.commandType === 'assessment_v2.evidence.attest'
          && body.payload?.outcome === 'accepted'
          && typeof body.payload.evidenceId === 'string';
      } catch { return false; }
    }, { timeout: responseTimeoutMs });
    const [response] = await Promise.all([responsePromise, acceptButtons.first().click()]);
    expect(response.status()).toBe(200);
    const body = response.request().postDataJSON() as { payload: { evidenceId: string } };
    const evidenceId = body.payload.evidenceId;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(evidenceId)
      || evidenceIds.has(evidenceId)) {
      throw new Error('ENTERPRISE_LIFECYCLE_EVIDENCE_ATTESTATION_BINDING_REJECTED');
    }
    evidenceIds.add(evidenceId);
    await expect(acceptButtons).toHaveCount(pendingBefore - 1, { timeout: responseTimeoutMs });
    await expect(acceptedHeadings).toHaveCount(acceptedBefore + 1, { timeout: responseTimeoutMs });
    responses.push({
      route: '/functions/v1/assess-v2-command',
      status: response.status(),
      evidenceId,
      actionId: actionReference(response.request()),
    });
    await expect(workspace.getByText(
      'Evidence attestation committed: Evidence accepted.', { exact: true },
    )).toBeVisible({ timeout: responseTimeoutMs });
  }
  return responses;
};

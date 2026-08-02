export type MarketingCaptureScenario = 'product' | 'studio' | 'application-portfolio';

export interface MarketingCaptureRuntime {
  development: boolean;
  test: boolean;
  dedicatedCaptureBuild: boolean;
}

export interface MarketingCaptureDecision {
  enabled: boolean;
  readOnly: true;
  scenario: MarketingCaptureScenario | null;
  reason: 'enabled' | 'not_requested' | 'unsupported_scenario' | 'production_disabled';
}

const scenarios = new Set<MarketingCaptureScenario>(['product', 'studio', 'application-portfolio']);

export function resolveMarketingCapture(
  search: string,
  runtime: MarketingCaptureRuntime,
): MarketingCaptureDecision {
  const requested = new URLSearchParams(search).get('capture');
  if (!requested) return { enabled: false, readOnly: true, scenario: null, reason: 'not_requested' };
  if (!scenarios.has(requested as MarketingCaptureScenario)) {
    return { enabled: false, readOnly: true, scenario: null, reason: 'unsupported_scenario' };
  }
  if (!runtime.development && !runtime.test && !runtime.dedicatedCaptureBuild) {
    return { enabled: false, readOnly: true, scenario: null, reason: 'production_disabled' };
  }
  return {
    enabled: true,
    readOnly: true,
    scenario: requested as MarketingCaptureScenario,
    reason: 'enabled',
  };
}

export const isProductMarketingCapture = (decision: MarketingCaptureDecision) =>
  decision.enabled && decision.scenario === 'product';

export const isStudioMarketingCapture = (decision: MarketingCaptureDecision) =>
  decision.enabled && (decision.scenario === 'product' || decision.scenario === 'studio');

export const isApplicationPortfolioMarketingCapture = (decision: MarketingCaptureDecision) =>
  decision.enabled && (decision.scenario === 'product' || decision.scenario === 'application-portfolio');

export function preserveMarketingCaptureSearch(
  nextSearch: string,
  decision: MarketingCaptureDecision,
) {
  if (!decision.enabled || !decision.scenario) return nextSearch;
  const params = new URLSearchParams(nextSearch.startsWith('?') ? nextSearch.slice(1) : nextSearch);
  params.set('capture', decision.scenario);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

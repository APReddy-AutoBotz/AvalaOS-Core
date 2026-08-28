export type ProductNavigationOrigin = 'hydrate' | 'user' | 'popstate' | 'authority-rebind';
export type ProductNavigationWrite = 'push' | 'replace';

export interface ProductNavigationTransition {
  epoch: number;
  origin: ProductNavigationOrigin;
}

export interface DefaultNavigationGate {
  explicitNavigationIntent: boolean;
  settlement: ProductNavigationSettlement;
}

export type ProductNavigationSettlement =
  | 'idle'
  | 'awaiting-classification'
  | 'settling-valid'
  | 'settling-rejected'
  | 'settled-valid'
  | 'settled-rejected';

/**
 * Authority defaults may initialize an ordinary session, but they must not
 * participate in durable URL reconstruction. The layout-phase rejection of a
 * mismatched URL/persistence tuple is not complete until React commits the safe
 * state, even though the tuple has already been classified as invalid.
 */
export function canApplyDefaultNavigation(input: DefaultNavigationGate) {
  return input.settlement === 'idle';
}

/**
 * Finite coordinator for URL writes. An epoch makes completion of stale async
 * navigation work harmless, while origin classification prevents hydration and
 * browser traversal from manufacturing additional history entries.
 */
export function createProductNavigationController(explicitNavigationIntent = false) {
  let epoch = 0;
  let pending: ProductNavigationTransition | null = null;
  let settlement: ProductNavigationSettlement = explicitNavigationIntent
    ? 'awaiting-classification'
    : 'idle';

  return {
    begin(origin: ProductNavigationOrigin): ProductNavigationTransition {
      pending = { epoch: ++epoch, origin };
      if (origin === 'user') settlement = 'idle';
      return pending;
    },
    beginSettlement(valid: boolean, origin: 'hydrate' | 'popstate' | 'authority-rebind' = 'hydrate'): ProductNavigationTransition {
      settlement = valid ? 'settling-valid' : 'settling-rejected';
      pending = { epoch: ++epoch, origin };
      return pending;
    },
    commitSettlement(transition: ProductNavigationTransition): boolean {
      if (!pending || pending.epoch !== transition.epoch || !settlement.startsWith('settling-')) return false;
      settlement = settlement === 'settling-valid' ? 'settled-valid' : 'settled-rejected';
      return true;
    },
    settlement(): ProductNavigationSettlement {
      return settlement;
    },
    needsClassification(): boolean {
      return settlement === 'awaiting-classification';
    },
    settlementPending(): boolean {
      return settlement === 'settling-valid' || settlement === 'settling-rejected';
    },
    rebind(): ProductNavigationTransition {
      settlement = 'idle';
      pending = { epoch: ++epoch, origin: 'authority-rebind' };
      return pending;
    },
    writeFor(transition: ProductNavigationTransition): ProductNavigationWrite | null {
      if (!pending || transition.epoch !== pending.epoch) return null;
      pending = null;
      return transition.origin === 'user' ? 'push' : 'replace';
    },
    current(): ProductNavigationTransition | null {
      return pending;
    },
  };
}

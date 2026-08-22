export type ProductNavigationOrigin = 'hydrate' | 'user' | 'popstate' | 'authority-rebind';
export type ProductNavigationWrite = 'push' | 'replace';

export interface ProductNavigationTransition {
  epoch: number;
  origin: ProductNavigationOrigin;
}

export interface DefaultNavigationGate {
  explicitNavigationIntent: boolean;
  navigationHydrated: boolean;
  navigationSettlementPending: boolean;
}

/**
 * Authority defaults may initialize an ordinary session, but they must not
 * participate in durable URL reconstruction. The layout-phase rejection of a
 * mismatched URL/persistence tuple is not complete until React commits the safe
 * state, even though the tuple has already been classified as invalid.
 */
export function canApplyDefaultNavigation(input: DefaultNavigationGate) {
  return !input.explicitNavigationIntent
    || (input.navigationHydrated && !input.navigationSettlementPending);
}

/**
 * Finite coordinator for URL writes. An epoch makes completion of stale async
 * navigation work harmless, while origin classification prevents hydration and
 * browser traversal from manufacturing additional history entries.
 */
export function createProductNavigationController() {
  let epoch = 0;
  let pending: ProductNavigationTransition | null = null;

  return {
    begin(origin: ProductNavigationOrigin): ProductNavigationTransition {
      pending = { epoch: ++epoch, origin };
      return pending;
    },
    rebind(): ProductNavigationTransition {
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

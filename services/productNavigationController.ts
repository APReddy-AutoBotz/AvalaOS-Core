export type ProductNavigationOrigin = 'hydrate' | 'user' | 'popstate' | 'authority-rebind';
export type ProductNavigationWrite = 'push' | 'replace';

export interface ProductNavigationTransition {
  epoch: number;
  origin: ProductNavigationOrigin;
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

import { expect, type Locator, type Page } from '@playwright/test';

export const PRODUCT_NAVIGATION_READINESS_TIMEOUT_MS = 15_000;

export type ProductNavigationShellState = 'mobile_open' | 'mobile_closed' | 'desktop';
export type ProductNavigationBranch = 'mobile' | 'desktop';
export type ProductNavigationControl = 'mobileIdentity' | 'opener' | 'desktopIdentity';

export type ProductNavigationReadinessAdapter = Readonly<{
  isVisible: (control: ProductNavigationControl) => Promise<boolean>;
  waitForAnyVisible: (timeoutMs: number) => Promise<void>;
  clickOpener: () => Promise<void>;
  requireVisible: (control: 'mobileIdentity' | 'desktopIdentity', timeoutMs: number) => Promise<void>;
}>;

const inspectShellState = async (
  adapter: ProductNavigationReadinessAdapter,
): Promise<ProductNavigationShellState | null> => {
  const [mobileIdentityVisible, openerVisible, desktopIdentityVisible] = await Promise.all([
    adapter.isVisible('mobileIdentity'),
    adapter.isVisible('opener'),
    adapter.isVisible('desktopIdentity'),
  ]);
  if (mobileIdentityVisible) return 'mobile_open';
  if (openerVisible) return 'mobile_closed';
  if (desktopIdentityVisible) return 'desktop';
  return null;
};

export const resolveProductNavigationShell = async (
  adapter: ProductNavigationReadinessAdapter,
  timeoutMs = PRODUCT_NAVIGATION_READINESS_TIMEOUT_MS,
): Promise<ProductNavigationShellState> => {
  const immediate = await inspectShellState(adapter);
  if (immediate) return immediate;
  try {
    await adapter.waitForAnyVisible(timeoutMs);
  } catch {
    throw new Error('PRODUCT_NAVIGATION_SHELL_NOT_READY');
  }
  const settled = await inspectShellState(adapter);
  if (!settled) throw new Error('PRODUCT_NAVIGATION_SHELL_NOT_READY');
  return settled;
};

export const openProductNavigationWithAdapter = async (
  adapter: ProductNavigationReadinessAdapter,
  timeoutMs = PRODUCT_NAVIGATION_READINESS_TIMEOUT_MS,
): Promise<ProductNavigationBranch> => {
  const shellState = await resolveProductNavigationShell(adapter, timeoutMs);
  if (shellState === 'mobile_closed') {
    await adapter.clickOpener();
    await adapter.requireVisible('mobileIdentity', timeoutMs);
    return 'mobile';
  }
  if (shellState === 'mobile_open') {
    await adapter.requireVisible('mobileIdentity', timeoutMs);
    return 'mobile';
  }
  await adapter.requireVisible('desktopIdentity', timeoutMs);
  return 'desktop';
};

const productNavigationLocator = (page: Page, control: ProductNavigationControl): Locator => {
  if (control === 'mobileIdentity') return page.getByTestId('mobile-current-user');
  if (control === 'opener') return page.getByRole('button', { name: 'Open navigation' });
  return page.getByTestId('desktop-current-user');
};

export const createProductNavigationReadinessAdapter = (
  page: Page,
): ProductNavigationReadinessAdapter => ({
  isVisible: async control => productNavigationLocator(page, control).isVisible().catch(() => false),
  waitForAnyVisible: async timeoutMs => {
    await expect.poll(async () => {
      const visibility = await Promise.all([
        productNavigationLocator(page, 'mobileIdentity').isVisible().catch(() => false),
        productNavigationLocator(page, 'opener').isVisible().catch(() => false),
        productNavigationLocator(page, 'desktopIdentity').isVisible().catch(() => false),
      ]);
      return visibility.some(Boolean);
    }, {
      message: 'The signed-in product navigation shell must become semantically ready.',
      timeout: timeoutMs,
    }).toBe(true);
  },
  clickOpener: async () => {
    await productNavigationLocator(page, 'opener').click();
  },
  requireVisible: async (control, timeoutMs) => {
    await expect(productNavigationLocator(page, control)).toBeVisible({ timeout: timeoutMs });
  },
});

export const openProductNavigation = async (page: Page): Promise<ProductNavigationBranch> => (
  openProductNavigationWithAdapter(createProductNavigationReadinessAdapter(page))
);

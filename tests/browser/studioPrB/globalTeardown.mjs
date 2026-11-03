export default async function studioPrBGlobalTeardown() {
  try {
    const browserPort = process.env.STUDIO_PR_B_BROWSER_PORT ?? '4197';
    await fetch(`http://127.0.0.1:${browserPort}/__studio_pr_b_shutdown`, { method: 'POST' });
  } catch {
    // Playwright may already have closed its dedicated child after a startup failure.
  }
}

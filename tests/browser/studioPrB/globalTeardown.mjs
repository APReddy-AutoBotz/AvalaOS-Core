export default async function studioPrBGlobalTeardown() {
  try {
    await fetch('http://127.0.0.1:4197/__studio_pr_b_shutdown', { method: 'POST' });
  } catch {
    // Playwright may already have closed its dedicated child after a startup failure.
  }
}

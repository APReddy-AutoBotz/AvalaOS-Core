import { createAvalaViteConfig } from './vite.config';

// Internal-only entrypoint selected by scripts/runTranscriptFlowBrowser.mjs.
// Netlify and ordinary `vite build` use vite.config.ts, whose adapter capability
// is unconditionally false regardless of ambient or public environment values.
export default createAvalaViteConfig({ syntheticBrowserTestBuild: true });

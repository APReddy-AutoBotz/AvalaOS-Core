import path from 'node:path';
import { tmpdir } from 'node:os';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  cacheDir: path.join(tmpdir(), 'avalaos-studio-pr-b-vite-cache'),
  plugins: [{
    name: 'studio-pr-b-controlled-evidence-transport',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === '../../services/supabaseClient' && importer?.replaceAll('\\', '/').endsWith('/components/auth/ControlledHumanNonProductionBanner.tsx')) {
        return '\0studio-pr-b-controlled-evidence-transport';
      }
    },
    load(id) {
      if (id !== '\0studio-pr-b-controlled-evidence-transport') return;
      return `
        const fixture = () => globalThis.__studioControlledEvidenceFixture;
        export const getControlledHumanBrowserBinding = () => ({ status: 'authorized' });
        export const listControlledHumanStepBindings = async () => fixture().list();
        export const armControlledHumanStep = option => fixture().arm(option);
        export const getLastCompletedControlledHumanProof = () => fixture().last();
      `;
    },
  }, react()],
  resolve: { alias: { '@': path.resolve(process.cwd(), '.') } },
  build: {
    rollupOptions: {
      input: {
        studioPrBHarness: path.resolve(process.cwd(), 'tests/browser/studioPrB/harness.html'),
      },
    },
  },
});

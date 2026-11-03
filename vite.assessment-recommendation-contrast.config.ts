import path from 'node:path';
import { tmpdir } from 'node:os';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  cacheDir: path.join(tmpdir(), 'avalaos-assessment-recommendation-contrast-vite-cache'),
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        assessmentRecommendationContrast: path.resolve(process.cwd(), 'tests/browser/assessmentRecommendationContrastHarness.html'),
      },
    },
  },
});

import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Vite replaces client environment values while building. `vite preview` only
  // serves the immutable output, so preview-time VITE_* values cannot select the
  // pilot authority boundary for this isolated production-build harness.
  define: {
    'import.meta.env.VITE_AVALA_RUNTIME_MODE': JSON.stringify('pilot'),
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://trust-test.invalid'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-anon-key'),
  },
  build: {
    outDir: 'dist-trust-assurance',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        trustAssuranceHarness: resolve(__dirname, 'tests/trust-assurance/browser/trustAssuranceHarness.html'),
      },
    },
  },
});

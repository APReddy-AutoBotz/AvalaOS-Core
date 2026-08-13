import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    const browserTestInput = process.env.PR1A_BROWSER_TEST_BUILD === 'true'
      ? { input: { main: path.resolve(__dirname, 'index.html'), browserHarness: path.resolve(__dirname, 'browser-harness.html') } }
      : process.env.STUDIO_PRIVATE_ARTIFACT_BROWSER_TEST_BUILD === 'true'
        ? { input: { main: path.resolve(__dirname, 'index.html'), studioPrivateArtifactsHarness: path.resolve(__dirname, 'tests/browser/studioPrivateArtifactsHarness.html') } }
        : {};
    const hostedSandboxEnabled =
      process.env.AVALAOS_HOSTED_NONPRODUCTION_STABLE_TESTING === 'authorized' &&
      process.env.SITE_NAME === 'avalaos-pilot';
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'import.meta.env.VITE_AVALA_HOSTED_SANDBOX_ENABLED': JSON.stringify(hostedSandboxEnabled ? 'true' : 'false'),
      },
      build: {
        rollupOptions: {
          ...browserTestInput,
          output: {
            manualChunks(id) {
              if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'vendor-react';
              if (id.includes('node_modules/@supabase')) return 'vendor-supabase';
              if (id.includes('node_modules/@google')) return 'vendor-ai';
            },
          },
        },
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

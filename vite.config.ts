import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

type AvalaViteConfigOptions = Readonly<{ syntheticBrowserTestBuild?: boolean }>;

// The default export is the only Netlify/ordinary build entrypoint and can
// never enable the loopback adapter from environment state. The repository's
// exact local browser runner selects the separate internal config explicitly.
export const createAvalaViteConfig = ({ syntheticBrowserTestBuild = false }: AvalaViteConfigOptions = {}) => defineConfig(() => {
    const browserTestInput = process.env.DELIVERY_MONITOR_PR_C_BROWSER_TEST_BUILD === 'true'
      ? { input: {
          main: path.resolve(__dirname, 'index.html'),
          deliveryMonitorPrCHarness: path.resolve(__dirname, 'tests/browser/deliveryMonitorPrC/harness.html'),
          enterpriseIntelligenceHarness: path.resolve(__dirname, 'tests/browser/enterpriseIntelligenceHarness.html'),
        } }
      : process.env.ENTERPRISE_INTELLIGENCE_BROWSER_TEST_BUILD === 'true'
        ? { input: { main: path.resolve(__dirname, 'index.html'), enterpriseIntelligenceHarness: path.resolve(__dirname, 'tests/browser/enterpriseIntelligenceHarness.html') } }
        : process.env.STUDIO_ARTIFACT_BROWSER_TEST_BUILD === 'true'
          ? { input: { main: path.resolve(__dirname, 'index.html'), studioArtifactsHarness: path.resolve(__dirname, 'tests/browser/studioArtifactsHarness.html') } }
          : process.env.PILOT_OPERATIONS_BROWSER_TEST_BUILD === 'true'
            ? { input: { main: path.resolve(__dirname, 'index.html'), pilotOperationsHarness: path.resolve(__dirname, 'tests/browser/pilotOperationsHarness.html') } }
            : process.env.PR1A_BROWSER_TEST_BUILD === 'true'
              ? { input: { main: path.resolve(__dirname, 'index.html'), browserHarness: path.resolve(__dirname, 'browser-harness.html') } }
              : process.env.STUDIO_PRIVATE_ARTIFACT_BROWSER_TEST_BUILD === 'true'
                ? { input: { main: path.resolve(__dirname, 'index.html'), studioPrivateArtifactsHarness: path.resolve(__dirname, 'tests/browser/studioPrivateArtifactsHarness.html') } }
                : {};
    const controlledHumanEnabled = process.env.VITE_PR_C_CONTROLLED_HUMAN_ENABLED === 'authorized';
    const controlledHumanBuildValue = (value: string | undefined) => controlledHumanEnabled ? value ?? '' : '';
    const hostedSandboxEnabled = !controlledHumanEnabled &&
      process.env.AVALAOS_HOSTED_NONPRODUCTION_STABLE_TESTING === 'authorized' &&
      process.env.SITE_NAME === 'avalaos-pilot';
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        '__AVALA_SYNTHETIC_BROWSER_TEST_BUILD__': JSON.stringify(syntheticBrowserTestBuild),
        'import.meta.env.VITE_AVALA_HOSTED_SANDBOX_ENABLED': JSON.stringify(hostedSandboxEnabled ? 'true' : 'false'),
        'import.meta.env.VITE_PR_C_CONTROLLED_HUMAN_RELEASE_SHA': JSON.stringify(controlledHumanBuildValue(process.env.COMMIT_REF)),
        'import.meta.env.VITE_PR_C_CONTROLLED_HUMAN_REVIEW_HEAD_SHA': JSON.stringify(controlledHumanBuildValue(process.env.COMMIT_REF)),
        'import.meta.env.VITE_PR_C_CONTROLLED_HUMAN_DEPLOY_ID': JSON.stringify(controlledHumanBuildValue(process.env.DEPLOY_ID)),
        'import.meta.env.VITE_PR_C_CONTROLLED_HUMAN_DEPLOY_ORIGIN': JSON.stringify(controlledHumanBuildValue(process.env.DEPLOY_PRIME_URL)),
        'import.meta.env.VITE_PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST': JSON.stringify(controlledHumanBuildValue(process.env.PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST)),
        'import.meta.env.VITE_PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT': JSON.stringify(controlledHumanBuildValue(process.env.PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT)),
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

export default createAvalaViteConfig();

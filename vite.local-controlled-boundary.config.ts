import { defineConfig, type ConfigEnv, type UserConfig } from 'vite';
import { createAvalaViteConfig } from './vite.config';

// This runner-only config keeps the real App and the synthetic loopback adapter,
// but refuses repository .env files even when they exist in a developer checkout.
const shared = createAvalaViteConfig({ syntheticBrowserTestBuild: true });
export default defineConfig((environment: ConfigEnv): UserConfig => ({
  ...(typeof shared === 'function' ? shared(environment) : shared),
  envDir: false,
}));

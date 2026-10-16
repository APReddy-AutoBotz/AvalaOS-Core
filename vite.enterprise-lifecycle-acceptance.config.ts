import { defineConfig, type ConfigEnv, type UserConfig } from 'vite';
import { createAvalaViteConfig } from './vite.config';

const resolveBase = async (env: ConfigEnv): Promise<UserConfig> => {
  const base = createAvalaViteConfig({ syntheticBrowserTestBuild: true });
  return typeof base === 'function' ? await base(env) : base;
};

export default defineConfig(async env => resolveBase(env));

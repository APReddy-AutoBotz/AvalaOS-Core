import { defineConfig, type ConfigEnv, type UserConfig } from 'vite';
import enterpriseLifecycleConfig from './vite.enterprise-lifecycle-acceptance.config';

const resolveEnterpriseLifecycleConfig = async (env: ConfigEnv): Promise<UserConfig> => (
  typeof enterpriseLifecycleConfig === 'function'
    ? await enterpriseLifecycleConfig(env)
    : enterpriseLifecycleConfig
);

export default defineConfig(async env => ({
  ...await resolveEnterpriseLifecycleConfig(env),
  // This credential-free probe supplies an explicit synthetic environment.
  // Ignore repository/user .env files without changing the shared build default.
  envDir: false as const,
}));

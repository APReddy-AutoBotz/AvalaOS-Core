import { defineConfig, type ConfigEnv, type UserConfig } from 'vite';
import { createAvalaViteConfig } from './vite.config';

const optionalClassicScripts = [
  '<script defer src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>',
  '<script defer src="https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js"></script>',
  '<script defer src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>',
] as const;
const importMap = /\s*<script type="importmap">[\s\S]*?<\/script>/u;

const resolveBase = async (env: ConfigEnv): Promise<UserConfig> => {
  const base = createAvalaViteConfig({ syntheticBrowserTestBuild: true });
  return typeof base === 'function' ? await base(env) : base;
};

export default defineConfig(async env => {
  const base = await resolveBase(env);
  return {
    ...base,
    plugins: [
      ...(base.plugins ?? []),
      {
        name: 'legacy-delivery-local-assets-only',
        enforce: 'pre',
        transformIndexHtml(html) {
          let transformed = html;
          for (const tag of optionalClassicScripts) {
            if (!transformed.includes(tag)) throw new Error('LEGACY_DELIVERY_OPTIONAL_CDN_TAG_MISSING');
            transformed = transformed.replace(tag, '');
          }
          if (!importMap.test(transformed)) throw new Error('LEGACY_DELIVERY_IMPORT_MAP_MISSING');
          transformed = transformed.replace(importMap, '');
          if (/\bhttps?:\/\//u.test(transformed)) throw new Error('LEGACY_DELIVERY_EXTERNAL_ASSET_REMAINED');
          return transformed;
        },
      },
    ],
  };
});

// This acceptance journey does not exercise optional global document renderers.
// Removing their CDN tags keeps the disposable browser proof loopback-only.

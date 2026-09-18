import { appendFileSync } from 'node:fs';
import path from 'node:path';

const trace = value => {
  const target = process.env.PR_C_PREFLIGHT_FIXTURE_TRACE_PATH;
  if (target) appendFileSync(target, `${value}\n`, 'utf8');
};

trace('transport-installed');

globalThis.fetch = async (url, options) => {
  if (url !== 'https://deploy-preview-264--avalaos-pilot.netlify.app'
    || options?.redirect !== 'error'
    || options?.headers?.Authorization !== undefined) {
    throw new Error('fixture-unexpected-fetch');
  }
  trace('preview-fetch');
  if (process.env.PR_C_PREFLIGHT_FIXTURE_MODE === 'preview-failure') {
    throw new Error('url=https://private.invalid token=fixture-token ref=fixture-ref stack=fixture-stack');
  }
  if (process.env.PR_C_PREFLIGHT_FIXTURE_MODE === 'source-change') {
    appendFileSync(path.resolve('scripts/prCControlledHumanCredentialPreflight.mjs'), '\n', 'utf8');
    trace('source-changed');
  }
  return {
    status: 200,
    headers: {
      get(name) {
        const headers = {
          'x-avalaos-release': process.env.PR_C_CONTROLLED_HUMAN_RELEASE_SHA,
          'x-avalaos-netlify-deploy-id': process.env.PR_C_CONTROLLED_HUMAN_DEPLOY_ID,
          'x-avalaos-environment': process.env.PR_C_CONTROLLED_HUMAN_ENVIRONMENT_CLASS,
        };
        return headers[String(name).toLowerCase()] ?? null;
      },
    },
    body: { cancel: async () => { trace('preview-body-cancelled'); } },
  };
};

import assert from 'node:assert/strict';
import { diagnosticOrigin, INVALID_NETWORK_ORIGIN } from './networkSafetyDiagnostics';

assert.equal(
  diagnosticOrigin('https://user:password@example.com:8443/private/path?token=secret#fragment'),
  'https://example.com:8443',
  'diagnostics must retain only scheme, host, and explicit port',
);
assert.equal(
  diagnosticOrigin('https://cdn.example.com/assets/app.js?apikey=secret'),
  'https://cdn.example.com',
  'diagnostics must discard paths and query strings',
);
assert.equal(
  diagnosticOrigin('not a url with secret=should-not-leak'),
  INVALID_NETWORK_ORIGIN,
  'malformed URLs must collapse to the fixed non-sensitive sentinel',
);

console.log('Network safety diagnostic origin tests passed.');

import { build } from 'vite';

process.env.VITE_AVALA_MARKETING_CAPTURE = 'true';
await build({ mode: 'capture' });
console.log('Built the dedicated read-only marketing capture harness.');

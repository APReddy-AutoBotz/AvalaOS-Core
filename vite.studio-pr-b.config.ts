import path from 'node:path';
import { tmpdir } from 'node:os';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  cacheDir: path.join(tmpdir(), 'avalaos-studio-pr-b-vite-cache'),
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(process.cwd(), '.') } },
});

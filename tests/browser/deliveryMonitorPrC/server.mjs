import path from 'node:path';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const server = await createServer({
  cacheDir: path.join(process.env.TEMP ?? process.cwd(), 'avalaos-delivery-monitor-pr-c-vite-cache'),
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(process.cwd(), '.') } },
  server: { host: '127.0.0.1', port: 4198, strictPort: true },
  configFile: false,
});

server.middlewares.use('/__delivery_monitor_pr_c_shutdown', (_request, response) => {
  response.statusCode = 204;
  response.end();
  setTimeout(() => { void shutdown(); }, 10);
});

await server.listen();

let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  await server.close();
  process.exit(0);
};
process.once('SIGTERM', () => { void shutdown(); });
process.once('SIGINT', () => { void shutdown(); });

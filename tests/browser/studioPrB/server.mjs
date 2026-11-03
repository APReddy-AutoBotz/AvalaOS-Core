import path from 'node:path';
import { createServer } from 'vite';

const browserPort = Number(process.env.STUDIO_PR_B_BROWSER_PORT ?? '4197');
const server = await createServer({
  configFile: path.resolve('vite.studio-pr-b.config.ts'),
  configLoader: 'runner',
  server: { host: '127.0.0.1', port: browserPort, strictPort: true },
  plugins: [{
    name: 'studio-pr-b-global-teardown',
    configureServer(viteServer) {
      viteServer.middlewares.use('/__studio_pr_b_shutdown', (_request, response) => {
        response.statusCode = 204;
        response.end();
        setTimeout(() => { void server.close(); }, 10);
      });
    },
  }],
});
await server.listen();

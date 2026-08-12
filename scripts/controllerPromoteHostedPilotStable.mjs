// Controller diagnostic: this file is temporary and never merged.
// Final propagation check uses Netlify context=all and scope=all.
const proxyPath = process.env.AVALAOS_CONTROLLER_NETLIFY_MCP_PROXY_PATH;

if (!proxyPath?.startsWith('https://netlify-mcp.netlify.app/proxy/')) {
  throw new Error('CONTROLLER_NETLIFY_PROXY_NOT_AVAILABLE');
}

console.log('Controller Netlify deployment proxy is available to the guarded Deploy Preview build.');

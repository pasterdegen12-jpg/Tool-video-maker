import http from 'node:http';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { readConfig } from '../api/lib/local-ai/config.js';
import { createBridge } from '../api/lib/local-ai/bridge.js';
import { BridgeError, sendError } from '../api/lib/local-ai/errors.js';

export function createLocalServer(config = readConfig(), options) {
  const bridge = createBridge(config, options);
  const server = http.createServer((req, res) => {
    // Reject DNS-rebinding hosts. The Vite proxy uses changeOrigin to this literal loopback host.
    if (req.headers.host !== '127.0.0.1:' + req.socket.localPort) {
      return sendError(res, new BridgeError('FORBIDDEN_ORIGIN'));
    }
    void bridge(req, res);
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 40;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const server = createLocalServer();
    server.on('error', () => { console.error('Local AI bridge could not bind 127.0.0.1:8789.'); process.exitCode = 1; });
    server.listen(8789, '127.0.0.1', () => console.log('Local CPU script bridge listening on 127.0.0.1:8789.'));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); server.closeAllConnections(); });
  } catch { console.error('Local AI bridge is disabled or its server environment is incomplete. See docs/local-ai-bridge.md.'); process.exitCode = 1; }
}

// Vite's existing host=true may serve other UI flows on LAN. Keep the local AI proxy loopback-only.
export function localAiLoopbackGuard(req, res, next) {
  if (req.url?.startsWith('/api/local-ai') && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress)) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: { code: 'LOCAL_ONLY' } }));
    return;
  }
  next();
}
export default function localAiLoopback() {
  return { name: 'local-ai-loopback-only', apply: 'serve', configureServer(server) {
    server.middlewares.use(localAiLoopbackGuard);
  } };
}

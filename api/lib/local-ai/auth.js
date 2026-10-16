import { verifyToken } from '@clerk/backend';
import { BridgeError } from './errors.js';

export async function authenticateSession(req, config) {
  let allowedOrigin = req.headers.origin === config.origin;
  // Same-origin browser GETs commonly omit Origin. Accept that case only with both
  // browser fetch metadata and an exact configured Referer origin; JWT azp stays mandatory.
  if (req.headers.origin === undefined && req.method === 'GET' && req.headers['sec-fetch-site'] === 'same-origin') {
    try {
      const referer = new URL(req.headers.referer);
      allowedOrigin = referer.origin === config.origin && !referer.username && !referer.password;
    } catch { allowedOrigin = false; }
  }
  if (!allowedOrigin) throw new BridgeError('FORBIDDEN_ORIGIN');
  // Bearer only; do not implicitly authenticate via cross-site cookies.
  const authorization = req.headers.authorization;
  const match = typeof authorization === 'string' && /^Bearer ([A-Za-z0-9_.-]{1,16384})$/.exec(authorization);
  if (!match) throw new BridgeError('UNAUTHORIZED');
  try {
    const claims = await verifyToken(match[1], {
      jwtKey: config.jwtKey, authorizedParties: [config.origin], clockSkewInMs: 0,
    });
    // Require a session for this Clerk instance, including v2 pending-session protection.
    if (claims.iss !== config.issuer || claims.azp !== config.origin ||
        typeof claims.sub !== 'string' || !/^user_[A-Za-z0-9]+$/.test(claims.sub) ||
        typeof claims.sid !== 'string' || !/^sess_[A-Za-z0-9]+$/.test(claims.sid) ||
        !Number.isFinite(claims.exp) || !Number.isFinite(claims.nbf) ||
        !Number.isFinite(claims.iat) || claims.sts === 'pending') throw 0;
    return { subject: claims.sub, session: claims.sid };
  } catch {
    throw new BridgeError('UNAUTHORIZED');
  }
}

// Preserve the existing CPU/visual bridge subject-only contract.
export async function authenticate(req, config) {
  return (await authenticateSession(req, config)).subject;
}

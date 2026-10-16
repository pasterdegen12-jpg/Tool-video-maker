import process from 'node:process';
import { BridgeError } from './errors.js';

export function integrationEnabled(env = process.env) {
  return env.NODE_ENV === 'development' && !env.VERCEL && env.LOCAL_AI_BRIDGE_ENABLED === 'true';
}

export function readConfig(env = process.env) {
  if (!integrationEnabled(env)) throw new BridgeError('INTEGRATION_DISABLED');
  try {
    const gateway = new URL(env.LOCAL_AI_GATEWAY_URL);
    // Phase 3A is loopback only. Literal IP avoids DNS rebinding and external DNS resolution.
    if (gateway.protocol !== 'http:' || gateway.hostname !== '127.0.0.1' ||
        gateway.pathname !== '/' || gateway.search || gateway.hash || gateway.username || gateway.password) throw 0;
    const origin = new URL(env.LOCAL_AI_WEB_ORIGIN || 'http://localhost:5173');
    if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname) ||
        origin.href !== origin.origin + '/') throw 0;
    const issuer = new URL(env.CLERK_ISSUER);
    if (issuer.protocol !== 'https:' || issuer.href !== issuer.origin + '/') throw 0;
    const token = env.LOCAL_AI_GATEWAY_TOKEN;
    if (typeof token !== 'string' || token.length < 32 || /\s/.test(token)) throw 0;
    const jwtKey = env.CLERK_JWT_KEY?.replace(/\\n/g, '\n');
    if (!jwtKey?.includes('-----BEGIN PUBLIC KEY-----')) throw 0;
    return Object.freeze({ visualEnabled: env.LOCAL_AI_VISUAL_ENABLED === 'true', gatewayUrl: gateway.origin, gatewayToken: token,
      origin: origin.origin, issuer: issuer.origin, jwtKey,
      requestTimeoutMs: 10000, bodyTimeoutMs: 10000,
      maxBodyBytes: 262144, maxResponseBytes: 2 * 1024 * 1024,
      jobTtlMs: 300000, maxPolls: 120, pollIntervalMs: 1000,
      maxJobs: 64, maxJobsPerUser: 8 });
  } catch {
    throw new BridgeError('CONFIGURATION_ERROR');
  }
}

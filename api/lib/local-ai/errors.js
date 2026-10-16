// Public messages are fixed strings: never forward an upstream body or SDK exception.
const definitions = {
  INTEGRATION_DISABLED: [404, 'Local AI integration is disabled.'],
  CONFIGURATION_ERROR: [503, 'Configure the local bridge server environment before starting.'],
  UNAUTHORIZED: [401, 'Sign in again and send a current Clerk session token.'],
  FORBIDDEN_ORIGIN: [403, 'Use the configured local Web AI origin.'],
  NOT_FOUND: [404, 'Route not found.'],
  METHOD_NOT_ALLOWED: [405, 'This method is not supported.'],
  INVALID_REQUEST: [422, 'Send only the fields accepted by this local AI operation.'],
  UNSUPPORTED_MEDIA_TYPE: [415, 'Send application/json.'],
  REQUEST_TOO_LARGE: [413, 'The request exceeds the supported size.'],
  REQUEST_BODY_TIMEOUT: [408, 'The request body did not arrive in time.'],
  JOB_NOT_FOUND: [404, 'Job is unavailable, expired, or was lost after a restart.'],
  POLL_EXPIRED: [410, 'The polling deadline has elapsed. Stop polling.'],
  POLL_LIMIT: [410, 'The polling attempt limit has been reached. Stop polling.'],
  POLL_TOO_FAST: [429, 'Wait before checking this job again.'],
  BRIDGE_CAPACITY: [429, 'The local bridge job capacity is full. Wait for jobs to expire.'],
  GATEWAY_CAPACITY: [429, 'The gateway queue is full. Respect Retry-After.'],
  GATEWAY_UNAVAILABLE: [503, 'The gateway is unavailable. Check its local process and the requested worker readiness.'],
  GATEWAY_AUTH_FAILED: [503, 'Check the server-side gateway service token.'],
  GATEWAY_TIMEOUT: [504, 'The gateway request timed out.'],
  GATEWAY_NETWORK_ERROR: [503, 'Cannot reach the configured local gateway.'],
  GATEWAY_INVALID_RESPONSE: [502, 'The gateway returned an unexpected response. Check API compatibility.'],
  INTERNAL_ERROR: [500, 'The local bridge could not complete this request.'],
};

export class BridgeError extends Error {
  constructor(code, { retryAfter, retryable = false, submission } = {}) {
    const [status, message] = definitions[code] || definitions.INTERNAL_ERROR;
    super(message);
    this.code = definitions[code] ? code : 'INTERNAL_ERROR';
    this.status = status;
    this.retryAfter = retryAfter;
    this.retryable = retryable;
    this.submission = submission;
  }
}

export function sendError(res, error) {
  const safe = error instanceof BridgeError ? error : new BridgeError('INTERNAL_ERROR');
  if (safe.retryAfter) res.setHeader('Retry-After', String(safe.retryAfter));
  sendJson(res, safe.status, { error: {
    code: safe.code, message: safe.message, retryable: safe.retryable,
    ...(safe.submission ? { submission: safe.submission } : {}),
  } });
}

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

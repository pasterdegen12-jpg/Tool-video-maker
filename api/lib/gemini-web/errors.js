export const errorMessages = Object.freeze({
  INVALID_SESSION: 'Enter a Cookie header value without line breaks (maximum 16 KiB).',
  SESSION_EXPIRED: 'The Gemini session has expired.',
  GEMINI_BOOTSTRAP_FAILED: 'Could not initialize the Gemini page.',
  TOKEN_PARSE_FAILED: 'Could not extract verified dynamic page tokens.',
  GEMINI_PROTOCOL_CHANGED: 'Experimental generation is disabled. Enable GEMINI_TEST_OMIT_BOTGUARD and submit the omit-botguard experiment; no Gemini request was sent.',
  GEMINI_REQUEST_FAILED: 'The Gemini request failed.',
  GEMINI_RATE_LIMITED: 'Gemini rate limited the request.',
  GEMINI_RESPONSE_PARSE_FAILED: 'Gemini returned no parseable answer text, or the response was incomplete/unrecognized.',
  VIDEO_UPLOAD_FAILED: 'Gemini file upload is not implemented until the text test passes.',
  VIDEO_TOO_LARGE: 'The video exceeds the allowed size.',
  NETWORK_ERROR: 'The network request failed.',
  UNKNOWN_ERROR: 'The test failed without a verified diagnostic.',
  INVALID_REQUEST: 'Provide a nonempty prompt (maximum 16,000 characters) and a session.',
  TEST_DISABLED: 'This endpoint is available only on the explicitly enabled local development server.',
  METHOD_NOT_ALLOWED: 'Use POST.',
  UNSUPPORTED_MEDIA_TYPE: 'Use application/json.',
  FORBIDDEN_ORIGIN: 'This request did not originate from the configured local test page.',
  REQUEST_TOO_LARGE: 'The request exceeds 64 KiB.',
});

export class GeminiTestError extends Error {
  constructor(code, status = 502) {
    super(errorMessages[code] || errorMessages.UNKNOWN_ERROR);
    this.code = Object.hasOwn(errorMessages, code) ? code : 'UNKNOWN_ERROR';
    this.status = status;
  }
}

export function publicError(error) {
  const known = error instanceof GeminiTestError;
  const code = known ? error.code : 'UNKNOWN_ERROR';
  return { status: known ? error.status : 500, body: { ok: false, code, message: errorMessages[code] } };
}
